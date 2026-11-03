/**
 * O relógio da sala: os passos do motor, os bots ao volante, a carência de
 * conexão e a expiração.
 *
 * O servidor chama `tick` a cada poucos milissegundos, só quando algum prazo
 * venceu (`nextDeadline`). Durante a partida o prazo é o próximo passo, então
 * na prática é 20 vezes por segundo.
 *
 * Dois tipos de mudança saem daqui, e o servidor trata cada uma de um jeito:
 * `changed` é mudança de SALA (sobe a versão, vira retrato para todos);
 * `frame` é só a arena andando (vira um quadro, sem versão nova).
 */

import { LIMITS } from '@omi-bomba/protocol';
import { aplicarEntrada, createRng, passo, TICK_MS, type Evento, type MatchState } from '@omi-bomba/rules';
import { decidirEntrada } from '@omi-bomba/bot';
import { garantirHost } from './anfitriao.js';
import { sealMatchEnd } from './room.js';
import { dirigidoPorBot, isOnline, isPresent, type Emission, type Room, type RoomCtx } from './types.js';

export interface TickResult {
  room: Room;
  emissions: Emission[];
  /** Mudou a sala: versão nova e retrato para todos. */
  changed: boolean;
  /** A arena deu ao menos um passo: quadro novo. */
  frame: boolean;
}

/**
 * Teto de passos atrasados recuperados numa chamada. Se o processo engasgou
 * por mais que isso (GC, disco), a arena anda devagar por um instante em vez
 * de dar um salto em que todo mundo morre sem ter visto a bomba.
 */
const MAX_PASSOS_ATRASADOS = 4;

/** O próximo instante em que algo pode mudar sozinho. */
export function nextDeadline(room: Room): number | null {
  const candidates: number[] = [];
  for (const p of room.players) {
    if (p.connection === 'RECONECTANDO' && p.socketLostAt !== null) {
      candidates.push(p.socketLostAt + LIMITS.transportGraceMs);
    }
  }
  if (room.status === 'EM_PARTIDA' && room.proximoPassoEm !== null) candidates.push(room.proximoPassoEm);
  candidates.push(room.createdAt + LIMITS.roomMaxLifeMs);
  if (!room.players.some((p) => isPresent(p) && isOnline(p) && p.bot === null)) {
    candidates.push(room.lastActivityAt + LIMITS.lobbyIdleMs);
  }
  return Math.min(...candidates);
}

export function tick(room: Room, ctx: RoomCtx): TickResult {
  let current = room;
  const emissions: Emission[] = [];
  let changed = false;

  const step = (result: { room: Room; emissions: Emission[]; changed: boolean }): void => {
    if (result.changed || result.emissions.length > 0) changed = true;
    current = result.room;
    emissions.push(...result.emissions);
  };

  step(expireTransportGrace(current, ctx));
  const arena = advanceMatch(current, ctx);
  current = arena.room;
  step(expireRoom(current, ctx));

  const sealed = sealMatchEnd(current);
  if (sealed !== current) {
    current = sealed;
    changed = true;
  }

  return {
    room: changed ? { ...current, stateVersion: current.stateVersion + 1 } : current,
    emissions,
    changed,
    frame: arena.frame,
  };
}

/** A carência acabou: quem não voltou conta como fora (e pode perder a sala). */
function expireTransportGrace(room: Room, ctx: RoomCtx): { room: Room; emissions: Emission[]; changed: boolean } {
  let players = room.players;
  let any = false;
  for (const p of room.players) {
    if (p.connection !== 'RECONECTANDO' || p.socketLostAt === null) continue;
    if (ctx.now < p.socketLostAt + LIMITS.transportGraceMs) continue;
    any = true;
    players = players.map((x) => (x.id === p.id ? { ...x, connection: 'DESCONECTADO' as const } : x));
  }
  if (!any) return { room, emissions: [], changed: false };
  const emissions: Emission[] = [];
  const next = garantirHost({ ...room, players }, emissions);
  return { room: next, emissions, changed: true };
}

/** Os passos devidos, com os bots decidindo antes de cada um. */
function advanceMatch(room: Room, ctx: RoomCtx): { room: Room; frame: boolean } {
  if (room.status !== 'EM_PARTIDA' || !room.match || room.proximoPassoEm === null) return { room, frame: false };
  if (ctx.now < room.proximoPassoEm) return { room, frame: false };

  // Um gerador por chamada, semeado do CSPRNG: o acaso do bot fácil não é
  // previsível de fora, e o motor continua sem saber que acaso existe.
  const rng = createRng(ctx.randomSeed());
  const volantes = room.players.filter((p) => room.match!.playerOrder.includes(p.id) && dirigidoPorBot(p));

  let m: MatchState = room.match;
  let proximo = room.proximoPassoEm;
  const eventos: Evento[] = [];
  let passos = 0;

  while (ctx.now >= proximo && passos < MAX_PASSOS_ATRASADOS && m.endReason === null) {
    for (const p of volantes) {
      m = aplicarEntrada(m, p.id, decidirEntrada(m, p.id, p.bot?.difficulty ?? 'MEDIO', rng));
    }
    m = passo(m);
    eventos.push(...m.eventos);
    proximo += TICK_MS;
    passos += 1;
  }
  // Atrasado além do teto: descarta o atraso em vez de acumular para sempre.
  if (ctx.now >= proximo) proximo = ctx.now + TICK_MS;

  // Os eventos de todos os passos recuperados vão no quadro: uma explosão no
  // passo do meio não pode sumir só porque saiu no mesmo lote.
  m = { ...m, eventos };
  return { room: { ...room, match: m, proximoPassoEm: m.endReason === null ? proximo : null }, frame: passos > 0 };
}

function expireRoom(room: Room, ctx: RoomCtx): { room: Room; emissions: Emission[]; changed: boolean } {
  if (room.status === 'ENCERRADA') return { room, emissions: [], changed: false };
  const tooOld = ctx.now >= room.createdAt + LIMITS.roomMaxLifeMs;
  const nobodyOnline = !room.players.some((p) => isPresent(p) && isOnline(p) && p.bot === null);
  const idle = nobodyOnline && ctx.now >= room.lastActivityAt + LIMITS.lobbyIdleMs;
  if (!tooOld && !idle) return { room, emissions: [], changed: false };
  return { room: { ...room, status: 'ENCERRADA', proximoPassoEm: null }, emissions: [], changed: true };
}
