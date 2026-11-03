/**
 * O WebSocket da sala: `/api/rooms/{code}/ws?token=...`.
 *
 * O token assinado diz quem é quem; o hub entrega os retratos. Aqui só se
 * autentica, limita, valida e encaminha o comando para a sala.
 */

import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { CLOSE_CODES, LIMITS, type ServerEvent } from '@omi-bomba/protocol';
import { isWithinSizeLimit, parseClientMessage } from '@omi-bomba/protocol/validate';
import { applyCommand, disconnect, foiExpulso, reconnect, snapshotFor } from '@omi-bomba/room';
import type { PlayerId } from '@omi-bomba/rules';
import type { Hub } from './hub.js';
import { createIdempotencyCache, createRateLimiter } from './limits.js';
import type { SessionSigner } from './session.js';

export interface WsOptions {
  hub: Hub;
  signer: SessionSigner;
  now?: () => number;
  allowedOrigin?: string | undefined;
}

const WS_PATH = /^\/api\/rooms\/([^/]+)\/ws$/;
const HEARTBEAT_MS = 20_000;
const HEARTBEAT_TIMEOUT_MS = 45_000;

interface Attached {
  code: string;
  playerId: PlayerId;
}

export interface Upgradable {
  on(event: 'upgrade', listener: (req: IncomingMessage, socket: Duplex, head: Buffer) => void): unknown;
}

export function attachWebSocket(server: Upgradable, options: WsOptions): { close(): void } {
  const { hub, signer } = options;
  const now = options.now ?? Date.now;
  const wss = new WebSocketServer({ noServer: true, maxPayload: LIMITS.maxMessageBytes * 2 });
  const lastSeen = new WeakMap<WebSocket, number>();

  const refuse = (socket: Duplex, status: string): void => {
    socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
    socket.destroy();
  };

  server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const match = WS_PATH.exec(url.pathname);
    if (!match) return refuse(socket, '404 Not Found');

    // CSWSH: navegador de outro site não abre socket na sala de ninguém.
    const origin = request.headers.origin;
    if (options.allowedOrigin && origin !== undefined && origin !== options.allowedOrigin) {
      return refuse(socket, '403 Forbidden');
    }

    const code = (match[1] ?? '').toUpperCase();
    const verified = signer.verify(url.searchParams.get('token') ?? '', now(), code);

    wss.handleUpgrade(request, socket, head, (ws) => {
      if (!verified.ok) {
        hub.sendError(ws, { code: 'INVALID_TOKEN', params: { motivo: verified.reason } }, 0);
        ws.close(CLOSE_CODES.INVALID_TOKEN, 'sessão inválida');
        return;
      }
      wss.emit('connection', ws, request, {
        code: verified.claims.roomCode,
        playerId: verified.claims.playerId,
      } satisfies Attached);
    });
  });

  wss.on('connection', (ws: WebSocket, _request: IncomingMessage, session: Attached) => {
    const { code, playerId } = session;
    const room = hub.get(code);
    if (!room || room.status === 'ENCERRADA') {
      hub.sendError(ws, { code: 'ROOM_NOT_FOUND' }, 0);
      ws.close(CLOSE_CODES.ROOM_NOT_FOUND, 'sala não existe');
      return;
    }

    const eu = room.players.find((p) => p.id === playerId);
    if (!eu || eu.connection === 'SAIU' || eu.connection === 'REMOVIDO' || foiExpulso(eu)) {
      hub.sendError(ws, { code: 'INVALID_TOKEN', params: { motivo: 'FORA_DA_SALA' } }, room.stateVersion);
      ws.close(CLOSE_CODES.INVALID_TOKEN, 'fora da sala');
      return;
    }

    // Uma aba por pessoa: a nova assume, a antiga é avisada e não insiste.
    const previous = hub.socketOf(code, playerId);
    if (previous && previous !== ws) {
      hub.sendError(previous, { code: 'SESSION_TAKEN' }, room.stateVersion);
      previous.close(CLOSE_CODES.SESSION_TAKEN, 'sessão assumida em outra aba');
    }
    hub.attach(code, playerId, ws);
    lastSeen.set(ws, now());

    const rate = createRateLimiter({ limit: LIMITS.commandsPerWindow, windowMs: LIMITS.commandWindowMs });
    const rateDeJogo = createRateLimiter({ limit: LIMITS.inputsPerWindow, windowMs: LIMITS.inputWindowMs });
    const seen = createIdempotencyCache<ServerEvent>(LIMITS.idempotencyWindowMs);

    const back = reconnect(room, playerId, hub.ctx());
    const atual = back.ok ? back.room : room;
    // O retrato completo primeiro, com o chat; depois o commit avisa os outros.
    hub.send(ws, snapshotFor(atual), atual.stateVersion);
    if (back.ok) hub.commit(back);

    ws.on('pong', () => lastSeen.set(ws, now()));

    ws.on('message', (raw) => {
      lastSeen.set(ws, now());
      const text = raw.toString();
      if (!isWithinSizeLimit(text)) return;

      const current = hub.get(code);
      if (!current) return;
      const version = current.stateVersion;

      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        hub.sendError(ws, { code: 'VALIDATION_FAILED' }, version);
        return;
      }

      const parsed = parseClientMessage(payload);
      if (!parsed.ok) {
        hub.sendError(ws, { code: parsed.code, params: { issues: parsed.issues } }, version);
        return;
      }

      // Tecla tem teto e caminho próprios: sem `ack`, sem idempotência, e erro
      // calado. Apertar uma seta depois do fim da rodada não é motivo de aviso
      // vermelho na tela.
      if (parsed.value.command.type === 'game:input') {
        if (!rateDeJogo.check(playerId, now()).allowed) return;
        const result = applyCommand(current, playerId, parsed.value.command, hub.ctx());
        if (result.ok) hub.commit(result);
        return;
      }

      const decision = rate.check(playerId, now());
      if (!decision.allowed) {
        hub.sendError(ws, { code: 'RATE_LIMITED', params: { retryAfterMs: decision.retryAfterMs } }, version);
        return;
      }

      const commandId = parsed.value.envelope.id;
      const remembered = seen.recall(commandId, now());
      if (remembered) {
        hub.send(ws, remembered, version);
        return;
      }

      // Resync manda o retrato completo de novo, com o chat.
      if (parsed.value.command.type === 'room:resync') {
        hub.send(ws, snapshotFor(current), version);
        return;
      }

      const result = applyCommand(current, playerId, parsed.value.command, hub.ctx());
      if (!result.ok) {
        hub.send(ws, { type: 'error', payload: { commandId, code: result.code, params: { motivo: result.motivo } } }, version);
        return;
      }

      hub.commit(result);
      const ack: ServerEvent = { type: 'ack', payload: { commandId } };
      seen.remember(commandId, ack, now());
      hub.send(ws, ack, result.room.stateVersion);
    });

    ws.on('close', () => {
      hub.detach(code, playerId, ws);
      const live = hub.get(code);
      if (!live) return;
      // Outra aba assumiu: este fechamento não é queda de ninguém.
      if (hub.socketOf(code, playerId)) return;
      hub.commit(disconnect(live, playerId, hub.ctx()));
    });
  });

  const heartbeat = setInterval(() => {
    const at = now();
    for (const ws of wss.clients) {
      if (at - (lastSeen.get(ws) ?? at) > HEARTBEAT_TIMEOUT_MS) {
        ws.terminate();
        continue;
      }
      if (ws.readyState === ws.OPEN) ws.ping();
    }
  }, HEARTBEAT_MS);
  heartbeat.unref();

  return {
    close() {
      clearInterval(heartbeat);
      wss.close();
    },
  };
}
