/**
 * O servidor de ponta a ponta: HTTP real, WebSocket real, sala real, arena
 * andando no relógio de verdade.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as caminho } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serve } from '@hono/node-server';
import WebSocket from 'ws';
import { PROTOCOL_VERSION, type RoomView } from '@omi-bomba/protocol';
import { NASCEDOUROS, type MatchView } from '@omi-bomba/rules';
import { createMemoryStore } from '@omi-bomba/store';
import { createHub } from '../src/hub.js';
import { createHttpApp } from '../src/http.js';
import { createPersistence } from '../src/persistence.js';
import { createSigner } from '../src/session.js';
import { attachWebSocket } from '../src/ws.js';

const cliente = caminho(tmpdir(), `omi-bomba-teste-${process.pid}`);
mkdirSync(cliente, { recursive: true });
writeFileSync(caminho(cliente, 'index.html'),
  '<html><head><title>OmiBomba</title><meta property="og:title" content="OmiBomba"><meta property="og:description" content=""><meta name="description" content=""><meta property="og:image" content="/og.png"></head><body><script type="module" src="/x.js"></script></body></html>');

let base = '';
let fechar: () => void = () => {};

beforeAll(async () => {
  const hub = createHub({ persistence: createPersistence({ store: createMemoryStore() }), randomSeed: () => 'semente' });
  const signer = createSigner('x'.repeat(40));
  const app = createHttpApp({ hub, signer, clientPath: cliente });
  const server = serve({ fetch: app.fetch, port: 0 });
  await new Promise((r) => server.once('listening', r));
  const ws = attachWebSocket(server, { hub, signer });
  const relogio = setInterval(() => hub.advance(Date.now()), 10);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  fechar = () => { clearInterval(relogio); ws.close(); server.close(); };
});

afterAll(() => fechar());

interface Sessao { roomCode: string; playerId: string; sessionToken: string; wsUrl: string }

async function post<T>(path: string, body: unknown): Promise<{ status: number; body: T }> {
  const r = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, body: (await r.json()) as T };
}

/** Um cliente de socket que guarda o último retrato, o último quadro e espera por condição. */
function conectar(s: Sessao) {
  const ws = new WebSocket(`${base.replace('http', 'ws')}/api/rooms/${s.roomCode}/ws?token=${encodeURIComponent(s.sessionToken)}`);
  let sala: RoomView | null = null;
  let quadro: MatchView | null = null;
  let quadros = 0;
  const mensagens: { type: string; payload: unknown }[] = [];
  const espera: (() => void)[] = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString()) as { type: string; payload: unknown };
    mensagens.push(m);
    if (m.type === 'room:snapshot' || m.type === 'room:state') {
      sala = m.payload as RoomView;
      if (sala.match) quadro = sala.match;
    }
    if (m.type === 'game:frame') {
      quadro = m.payload as MatchView;
      quadros += 1;
    }
    for (const f of [...espera]) f();
  });
  let n = 0;
  return {
    ws,
    mensagens,
    get sala() { return sala; },
    get quadro() { return quadro; },
    get quadros() { return quadros; },
    enviar(type: string, payload: unknown = {}) {
      ws.send(JSON.stringify({ v: PROTOCOL_VERSION, id: `c${++n}`, type, ts: Date.now(), payload }));
    },
    ate(cond: () => boolean, ms = 6_000): Promise<void> {
      return new Promise((ok, falha) => {
        if (cond()) return ok();
        const t = setTimeout(() => falha(new Error('tempo esgotado esperando condição')), ms);
        const f = () => { if (cond()) { clearTimeout(t); espera.splice(espera.indexOf(f), 1); ok(); } };
        espera.push(f);
      });
    },
  };
}

describe('servidor', () => {
  it('responde a saúde no formato que o deploy e o checkup esperam', async () => {
    const r = await fetch(`${base}/api/health`);
    const corpo = (await r.json()) as { ok: boolean; version: string };
    expect(r.status).toBe(200);
    expect(corpo.ok).toBe(true);
    expect(typeof corpo.version).toBe('string');
  });

  it('serve o HTML com nonce e uma CSP só', async () => {
    const r = await fetch(`${base}/`);
    const csp = r.headers.get('content-security-policy') ?? '';
    const html = await r.text();
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    expect(nonce).toBeTruthy();
    expect(html).toContain(`nonce="${nonce}"`);
  });

  it('recusa apelido inválido e personagem que não existe', async () => {
    expect((await post('/api/rooms', { nickname: 'x' })).status).toBe(422);
    expect((await post('/api/rooms', { nickname: 'Ana', personagem: 'mario' })).status).toBe(422);
  });

  it('o link de convite chega como cartão com o código da sala', async () => {
    const { body } = await post<Sessao>('/api/rooms', { nickname: 'Ana', personagem: 'brasa' });
    const html = await (await fetch(`${base}/j/${body.roomCode}`)).text();
    expect(html).toContain(`Sala ${body.roomCode}`);
  });

  it('partida de ponta a ponta: lobby, bot, contagem, andar, bomba', async () => {
    const criada = await post<Sessao>('/api/rooms', { nickname: 'Ana', personagem: 'pavio' });
    expect(criada.status).toBe(201);
    const ana = conectar(criada.body);
    await ana.ate(() => ana.sala !== null);

    const entrou = await post<Sessao>(`/api/rooms/${criada.body.roomCode}/join`, { nickname: 'Beto', personagem: 'pavio' });
    expect(entrou.status).toBe(200);
    const beto = conectar(entrou.body);
    await beto.ate(() => beto.sala !== null);
    await ana.ate(() => (ana.sala?.players.length ?? 0) === 2);
    // Personagem repetido na arena: quem chegou depois troca.
    const pBeto = ana.sala!.players.find((p) => p.id === entrou.body.playerId)!;
    expect(pBeto.personagem).not.toBe('pavio');

    ana.enviar('host:addBot', { difficulty: 'FACIL' });
    await ana.ate(() => (ana.sala?.players.length ?? 0) === 3);

    ana.enviar('player:setPronto', { pronto: true });
    beto.enviar('player:setPronto', { pronto: true });
    await ana.ate(() => ana.sala!.players.every((p) => p.pronto));
    ana.enviar('host:startMatch');
    await ana.ate(() => ana.sala?.status === 'EM_PARTIDA');
    await beto.ate(() => beto.quadro?.fase === 'JOGANDO', 5_000);
    expect(ana.quadros).toBeGreaterThan(30);

    // Beto anda: para onde houver saída a partir do nascedouro.
    const v = beto.quadro!;
    const eu = v.jogadores.find((j) => j.id === entrou.body.playerId)!;
    const canto = NASCEDOUROS.findIndex(([x, y]) => x === eu.x && y === eu.y);
    expect(canto).toBeGreaterThanOrEqual(0);
    const dir = eu.x === 1 ? 'DIREITA' : eu.x === 13 ? 'ESQUERDA' : 'CIMA';
    beto.enviar('game:input', { matchId: v.matchId, dir, bomba: true });
    await beto.ate(() => {
      const j = beto.quadro!.jogadores.find((x) => x.id === eu.id)!;
      return j.x !== eu.x || j.y !== eu.y || j.mov !== null;
    });
    // A bomba saiu no nascedouro.
    await beto.ate(() => beto.quadro!.bombas.some((b) => b.dono === eu.id));
    beto.enviar('game:input', { matchId: v.matchId, dir: null, bomba: false });

    // Espectador não joga: um terceiro que entra agora assiste.
    const tarde = await post<Sessao & { role: string }>(`/api/rooms/${criada.body.roomCode}/join`, { nickname: 'Caio' });
    expect(tarde.body.role).toBe('SPECTATOR');

    // O anfitrião encerra; o fim de partida chega pelo retrato.
    ana.enviar('host:endMatch');
    await ana.ate(() => ana.sala?.status === 'FIM_DE_PARTIDA');
    ana.ws.close();
    beto.ws.close();
  }, 20_000);

  it('quem cai no meio da partida tem o personagem dirigido por bot e volta ao reconectar', async () => {
    const criada = await post<Sessao>('/api/rooms', { nickname: 'Dani', personagem: 'musgo' });
    const dani = conectar(criada.body);
    await dani.ate(() => dani.sala !== null);
    dani.enviar('host:addBot', { difficulty: 'DIFICIL' });
    await dani.ate(() => (dani.sala?.players.length ?? 0) === 2);
    dani.enviar('player:setPronto', { pronto: true });
    await dani.ate(() => dani.sala!.players.every((p) => p.pronto));
    dani.enviar('host:startMatch');
    await dani.ate(() => dani.quadro?.fase === 'JOGANDO', 5_000);
    dani.ws.close();

    // Outro cliente com o mesmo token: a sessão continua valendo.
    const volta = await post<Sessao>(`/api/rooms/${criada.body.roomCode}/session`, { sessionToken: criada.body.sessionToken });
    expect(volta.status).toBe(200);
    const dani2 = conectar(volta.body);
    await dani2.ate(() => dani2.sala?.status === 'EM_PARTIDA');
    expect(dani2.sala!.players.find((p) => p.id === criada.body.playerId)?.bot).toBeUndefined();
    dani2.ws.close();
  }, 20_000);
});
