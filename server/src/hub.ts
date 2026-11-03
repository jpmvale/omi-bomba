/**
 * O hub: as salas vivas na memória do processo e os sockets de cada uma.
 *
 * Um processo só, como no FDP e no dominó: com todas as conexões de uma sala no mesmo
 * processo, o broadcast é um laço sobre um `Map`, e o laço de eventos do Node
 * dá atomicidade de mutação sem lock.
 *
 * A cada mudança de versão, cada socket recebe o retrato da sala; a cada passo
 * da arena, o quadro do jogo. São as duas únicas formas de estado sair daqui.
 */

import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import { CLOSE_CODES, PROTOCOL_VERSION, type ErrorPayload, type ServerEvent } from '@omi-bomba/protocol';
import { project } from '@omi-bomba/rules';
import {
  nextDeadline,
  tick,
  viewFor,
  type Emission,
  type Room,
  type RoomCtx,
  type RoomResult,
} from '@omi-bomba/room';
import type { PlayerId } from '@omi-bomba/rules';
import type { Persistence } from './persistence.js';

export interface Hub {
  get(code: string): Room | undefined;
  adopt(room: Room): void;
  commit(result: RoomResult): void;
  attach(code: string, playerId: PlayerId, socket: WebSocket): void;
  detach(code: string, playerId: PlayerId, socket: WebSocket): void;
  socketOf(code: string, playerId: PlayerId): WebSocket | undefined;
  send(socket: WebSocket | undefined, event: ServerEvent, stateVersion: number): void;
  sendError(socket: WebSocket | undefined, payload: ErrorPayload, stateVersion: number): void;
  ctx(): RoomCtx;
  advance(now: number): void;
  closeAll(code: number): void;
  readonly roomCount: number;
}

export interface HubOptions {
  persistence: Persistence;
  now?: () => number;
  randomSeed: () => string;
  newId?: () => string;
}

export function createHub({ persistence, now = Date.now, randomSeed, newId = randomUUID }: HubOptions): Hub {
  const rooms = new Map<string, Room>();
  const sockets = new Map<string, Map<PlayerId, WebSocket>>();

  /** Última versão da grade que saiu para cada sala: só reenvia quando muda. */
  const gradeEnviada = new Map<string, number>();

  const envelope = (event: ServerEvent, stateVersion: number): string =>
    JSON.stringify({ v: PROTOCOL_VERSION, id: newId(), ts: now(), stateVersion, ...event });

  const sendRaw = (socket: WebSocket | undefined, texto: string): void => {
    if (!socket || socket.readyState !== socket.OPEN) return;
    socket.send(texto);
  };

  const send: Hub['send'] = (socket, event, stateVersion) => sendRaw(socket, envelope(event, stateVersion));

  /**
   * O quadro da arena, 20 vezes por segundo. Um JSON só para a sala inteira —
   * serializar por socket seria o mesmo texto cinco, dez vezes por passo. A
   * grade (195 dígitos) só vai quando mudou; o cliente guarda a última.
   */
  const broadcastFrame = (room: Room): void => {
    const peers = sockets.get(room.code);
    if (!peers || peers.size === 0 || !room.match) return;
    const comGrade = gradeEnviada.get(room.code) !== room.match.gradeVersao;
    gradeEnviada.set(room.code, room.match.gradeVersao);
    const quadro = envelope({ type: 'game:frame', payload: project(room.match, comGrade) }, room.stateVersion);
    for (const socket of peers.values()) sendRaw(socket, quadro);
  };

  const deliver = (room: Room, emissions: Emission[], stateChanged: boolean): void => {
    const peers = sockets.get(room.code);
    if (!peers) return;

    if (stateChanged) {
      // O retrato é o mesmo para todos: serializa uma vez.
      const quadro = envelope({ type: 'room:state', payload: viewFor(room) }, room.stateVersion);
      for (const socket of peers.values()) sendRaw(socket, quadro);
      if (room.match) gradeEnviada.set(room.code, room.match.gradeVersao);
    }
    for (const emission of emissions) {
      if (emission.audience === 'ALL') {
        for (const socket of peers.values()) send(socket, emission.event, room.stateVersion);
      } else {
        send(peers.get(emission.audience.playerId), emission.event, room.stateVersion);
      }
    }

    // Quem saiu da sala (expulso, ou trocado por bot) não tem mais o que ver.
    for (const [playerId, socket] of peers) {
      const p = room.players.find((x) => x.id === playerId);
      const fora = !p || p.connection === 'REMOVIDO' || p.connection === 'SAIU' || p.expulsoEm !== null;
      if (fora) {
        send(socket, { type: 'error', payload: { code: 'INVALID_TOKEN', params: { motivo: 'FORA_DA_SALA' } } }, room.stateVersion);
        socket.close(CLOSE_CODES.INVALID_TOKEN, 'fora da sala');
        peers.delete(playerId);
      }
    }
  };

  const retire = (code: string): void => {
    const peers = sockets.get(code);
    for (const socket of peers?.values() ?? []) socket.close(CLOSE_CODES.ROOM_NOT_FOUND, 'sala encerrada');
    rooms.delete(code);
    sockets.delete(code);
    gradeEnviada.delete(code);
    persistence.forget(code);
  };

  const settle = (room: Room, emissions: Emission[]): void => {
    const before = rooms.get(room.code);
    rooms.set(room.code, room);
    deliver(room, emissions, before?.stateVersion !== room.stateVersion);
    if (room.status === 'ENCERRADA') retire(room.code);
    else persistence.schedule(room);
  };

  return {
    get: (code) => rooms.get(code),

    adopt(room) {
      rooms.set(room.code, room);
      if (!sockets.has(room.code)) sockets.set(room.code, new Map());
      persistence.schedule(room);
    },

    commit(result) {
      if (!result.ok) return;
      settle(result.room, result.emissions);
    },

    attach(code, playerId, socket) {
      const peers = sockets.get(code) ?? new Map<PlayerId, WebSocket>();
      peers.set(playerId, socket);
      sockets.set(code, peers);
    },

    detach(code, playerId, socket) {
      if (sockets.get(code)?.get(playerId) === socket) sockets.get(code)?.delete(playerId);
    },

    socketOf: (code, playerId) => sockets.get(code)?.get(playerId),

    send,

    sendError(socket, payload, stateVersion) {
      send(socket, { type: 'error', payload }, stateVersion);
    },

    ctx: () => ({ now: now(), randomSeed, newId }),

    advance(at) {
      for (const [code, room] of [...rooms]) {
        const deadline = nextDeadline(room);
        if (deadline !== null && at < deadline) continue;
        const result = tick(room, { now: at, randomSeed, newId });
        if (!result.changed && !result.frame) continue;
        if (rooms.get(code) !== room) continue;
        if (result.changed) {
          settle(result.room, result.emissions);
        } else {
          rooms.set(code, result.room);
          persistence.schedule(result.room);
        }
        // O quadro sai depois do retrato: quem recebe o fim de partida pelo
        // retrato já sabe o que fazer com o último quadro.
        if (result.frame) broadcastFrame(result.room);
      }
    },

    closeAll(code) {
      for (const peers of sockets.values()) {
        for (const socket of peers.values()) {
          if (socket.readyState === socket.OPEN) socket.close(code, 'reconecte');
        }
      }
    },

    get roomCount() {
      return rooms.size;
    },
  };
}

export { CLOSE_CODES };
