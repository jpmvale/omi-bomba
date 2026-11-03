/**
 * A sala: lobby, personagens únicos, quem manda, a partida andando pelo
 * relógio, queda e volta com bot ao volante, saída no meio da partida.
 */

import { describe, expect, it } from 'vitest';
import { LIMITS, type Command } from '@omi-bomba/protocol';
import { TICK_MS } from '@omi-bomba/rules';
import {
  applyCommand,
  createRoom,
  disconnect,
  join,
  leave,
  nextDeadline,
  reconnect,
  tick,
  viewFor,
  type Room,
  type RoomCtx,
  type RoomResult,
} from '../src/index.js';

function ctxAt(now: number): RoomCtx {
  let n = 0;
  return { now, randomSeed: () => `seed-${now}-${++n}`, newId: () => `id-${now}-${++n}` };
}

function ok(r: RoomResult): Room {
  if (!r.ok) throw new Error(`${r.code}: ${r.motivo}`);
  return r.room;
}

const cmd = (room: Room, who: string, command: Command, now = 1_000) => applyCommand(room, who, command, ctxAt(now));

function sala(n: number): Room {
  let room = createRoom('ABCDE', { playerId: 'p1', nickname: 'Ana', personagem: 'pavio' }, ctxAt(0));
  for (let i = 2; i <= n; i++) room = ok(join(room, { playerId: `p${i}`, nickname: `J${i}`, personagem: 'pavio' }, ctxAt(i)));
  return room;
}

function comPartida(n: number): Room {
  let room = sala(n);
  for (let i = 1; i <= n; i++) room = ok(cmd(room, `p${i}`, { type: 'player:setPronto', payload: { pronto: true } }));
  return ok(cmd(room, 'p1', { type: 'host:startMatch', payload: {} }));
}

/** Avança o relógio prazo a prazo até `ate`. */
function correr(room: Room, desde: number, ate: number): { room: Room; agora: number; quadros: number } {
  let agora = desde;
  let atual = room;
  let quadros = 0;
  for (let i = 0; i < 200_000 && agora < ate; i++) {
    const prazo = nextDeadline(atual);
    if (prazo === null || prazo > ate) break;
    agora = Math.max(agora, prazo);
    const r = tick(atual, ctxAt(agora));
    atual = r.room;
    if (r.frame) quadros += 1;
    if (atual.status === 'ENCERRADA' || atual.status === 'FIM_DE_PARTIDA') break;
  }
  return { room: atual, agora, quadros };
}

describe('lobby', () => {
  it('apelido e personagem repetidos ganham desempate na entrada', () => {
    const room = sala(2);
    const p2 = room.players.find((p) => p.id === 'p2')!;
    expect(p2.nickname).toBe('J2');
    expect(p2.personagem).not.toBe('pavio');
    const r3 = ok(join(room, { playerId: 'p3', nickname: 'Ana', personagem: p2.personagem }, ctxAt(3)));
    const p3 = r3.players.find((p) => p.id === 'p3')!;
    expect(p3.nickname).not.toBe('Ana');
    expect(new Set(r3.players.map((p) => p.personagem)).size).toBe(3);
  });

  it(`a arena cabe ${LIMITS.maxPlayers}; o próximo entra assistindo`, () => {
    const room = sala(LIMITS.maxPlayers + 1);
    expect(room.players.filter((p) => !p.isSpectator)).toHaveLength(LIMITS.maxPlayers);
    expect(room.players.find((p) => p.id === `p${LIMITS.maxPlayers + 1}`)!.isSpectator).toBe(true);
  });

  it('trocar para um personagem tomado é recusado', () => {
    const room = sala(2);
    const r = cmd(room, 'p2', { type: 'player:setProfile', payload: { nickname: 'J2', personagem: 'pavio' } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe('PERSONAGEM_TOMADO');
  });

  it('só o anfitrião manda, e só começa com todo mundo pronto', () => {
    let room = sala(2);
    expect(cmd(room, 'p2', { type: 'host:startMatch', payload: {} }).ok).toBe(false);
    const semPronto = cmd(room, 'p1', { type: 'host:startMatch', payload: {} });
    expect(semPronto.ok).toBe(false);
    room = ok(cmd(room, 'p1', { type: 'player:setPronto', payload: { pronto: true } }));
    room = ok(cmd(room, 'p2', { type: 'player:setPronto', payload: { pronto: true } }));
    room = ok(cmd(room, 'p1', { type: 'host:startMatch', payload: {} }));
    expect(room.status).toBe('EM_PARTIDA');
    expect(room.match?.playerOrder).toEqual(['p1', 'p2']);
  });

  it('bots completam a sala até o limite, e o host os tira', () => {
    let room = sala(1);
    for (let i = 0; i < LIMITS.maxBots; i++) room = ok(cmd(room, 'p1', { type: 'host:addBot', payload: { difficulty: 'MEDIO' } }));
    expect(cmd(room, 'p1', { type: 'host:addBot', payload: { difficulty: 'MEDIO' } }).ok).toBe(false);
    const bots = room.players.filter((p) => p.bot);
    expect(bots).toHaveLength(LIMITS.maxBots);
    expect(bots.every((b) => b.pronto)).toBe(true);
    expect(new Set(room.players.map((p) => p.personagem)).size).toBe(room.players.length);
    room = ok(cmd(room, 'p1', { type: 'host:removeBot', payload: { playerId: bots[0]!.id } }));
    expect(room.players.filter((p) => p.bot)).toHaveLength(LIMITS.maxBots - 1);
  });

  it('a vista pública não carrega o estado escondido do motor', () => {
    const room = comPartida(2);
    const texto = JSON.stringify(viewFor(room));
    expect(texto).not.toContain('ocultos');
    expect(texto).not.toContain('"seed"');
  });
});

describe('partida pelo relógio', () => {
  it('o relógio dá um passo a cada TICK_MS, e a tecla não sobe a versão da sala', () => {
    const room = comPartida(2);
    const v0 = room.stateVersion;
    const comTecla = ok(cmd(room, 'p1', { type: 'game:input', payload: { matchId: room.match!.id, dir: 'DIREITA', bomba: false } }));
    expect(comTecla.stateVersion).toBe(v0);
    const inicio = 1_000;
    const { room: depois, quadros } = correr(comTecla, inicio, inicio + 100 * TICK_MS);
    expect(quadros).toBeGreaterThanOrEqual(95);
    expect(depois.match!.passo).toBeGreaterThanOrEqual(95);
  });

  it('tecla de partida velha é recusada', () => {
    const room = comPartida(2);
    const r = cmd(room, 'p1', { type: 'game:input', payload: { matchId: 'outra', dir: null, bomba: true } });
    expect(r.ok).toBe(false);
  });

  it('humano contra bots: a partida termina sozinha com campeão ou sem', () => {
    let room = sala(1);
    room = ok(cmd(room, 'p1', { type: 'host:setOptions', payload: { options: { vitorias: 1 } } }));
    for (let i = 0; i < 3; i++) room = ok(cmd(room, 'p1', { type: 'host:addBot', payload: { difficulty: 'DIFICIL' } }));
    room = ok(cmd(room, 'p1', { type: 'player:setPronto', payload: { pronto: true } }));
    room = ok(cmd(room, 'p1', { type: 'host:startMatch', payload: {} }));
    // p1 caiu: o bot assume o volante até a volta.
    room = ok(disconnect(room, 'p1', ctxAt(1_000)));
    const { room: fim } = correr(room, 1_000, 1_000 + 60 * 60 * 1_000);
    expect(['FIM_DE_PARTIDA', 'ENCERRADA']).toContain(fim.status);
  });
});

describe('queda, volta e saída', () => {
  it('quem cai segue no jogo dirigido pelo bot e volta ao próprio volante', () => {
    let room = comPartida(2);
    room = ok(disconnect(room, 'p2', ctxAt(1_000)));
    // O bot anda com o personagem de p2 enquanto ele está fora.
    const antes = room.match!.jogadores.find((j) => j.id === 'p2')!;
    const { room: andou, agora } = correr(room, 1_000, 1_000 + 120 * TICK_MS);
    const depois = andou.match!.jogadores.find((j) => j.id === 'p2')!;
    expect(depois.x !== antes.x || depois.y !== antes.y || depois.mov !== null || andou.match!.bombas.length > 0 || !depois.vivo).toBe(true);
    room = ok(reconnect(andou, 'p2', ctxAt(agora)));
    const p2 = room.players.find((p) => p.id === 'p2')!;
    expect(p2.bot).toBeNull();
    expect(room.match!.jogadores.find((j) => j.id === 'p2')!.querDir).toBeNull();
  });

  it('quem sai no meio da partida vira bot de vez, e a partida segue', () => {
    let room = comPartida(3);
    room = ok(leave(room, 'p3', ctxAt(1_000)));
    expect(room.status).toBe('EM_PARTIDA');
    const assento = room.players.find((p) => room.match!.playerOrder.includes(p.id) && p.bot !== null);
    expect(assento).toBeDefined();
    expect(room.match!.playerOrder).toHaveLength(3);
  });

  it('o anfitrião passa adiante quando sai', () => {
    let room = sala(3);
    room = ok(leave(room, 'p1', ctxAt(5)));
    expect(room.hostId).not.toBe('p1');
    expect(room.hostId).not.toBeNull();
  });
});
