/**
 * Estado da sala.
 *
 * A sala é a camada acima do motor: cuida de quem está presente, de quem
 * manda, do relógio e de quem dirige cada personagem. Ela **não** decide o que
 * acontece na arena — isso é do motor, que ela chama passo a passo.
 *
 * Determinística como o motor: o tempo entra por `RoomCtx.now`.
 */

import type {
  BotDifficulty,
  ChatMessage,
  ConnectionStatus,
  ErrorCode,
  Personagem,
  PublicPlayer,
  RoomStatus,
  ServerEvent,
} from '@omi-bomba/protocol';
import type { MatchOptions, MatchState, PlayerId } from '@omi-bomba/rules';

/** `RECONECTANDO`: o socket caiu e a carência ainda corre. Nunca sai no fio. */
export type InternalConnection = ConnectionStatus | 'RECONECTANDO';

export interface RoomPlayer {
  id: PlayerId;
  nickname: string;
  personagem: Personagem;
  connection: InternalConnection;
  /** Entrou com partida em andamento, ou escolheu assistir. */
  isSpectator: boolean;
  joinedAt: number;
  lastSeenAt: number;
  socketLostAt: number | null;
  /** Avisou que saiu da tela (trocou de app, bloqueou o celular). */
  emSegundoPlano: boolean;
  pronto: boolean;
  silenciado: boolean;
  /** Expulso (ou saiu) no meio da partida: o assento segue com um bot, a pessoa não volta. */
  expulsoEm: number | null;
  lastChatAt: number | null;
  bot: { difficulty: BotDifficulty } | null;
}

export interface Room {
  code: string;
  status: RoomStatus;
  hostId: PlayerId | null;
  players: RoomPlayer[];
  ordem: PlayerId[];
  options: MatchOptions;
  match: MatchState | null;
  /** Quando o motor dá o próximo passo. `null` fora de partida. */
  proximoPassoEm: number | null;
  /** Monotônico, nunca reutilizado. Sobe a cada mudança de SALA, não a cada passo. */
  stateVersion: number;
  createdAt: number;
  lastActivityAt: number;
  chat: ChatMessage[];
}

/** Evento já endereçado. O retrato da sala sai sempre, à parte destes. */
export interface Emission {
  audience: 'ALL' | { playerId: PlayerId };
  event: ServerEvent;
}

export type RoomResult =
  | { ok: true; room: Room; emissions: Emission[] }
  | { ok: false; code: ErrorCode; motivo: string };

export interface RoomCtx {
  now: number;
  randomSeed: () => string;
  newId: () => string;
}

export interface JoinParams {
  playerId: PlayerId;
  nickname: string;
  personagem: Personagem;
}

export function toPublicPlayer(player: RoomPlayer): PublicPlayer {
  return {
    id: player.id,
    nickname: player.nickname,
    personagem: player.personagem,
    connection: player.connection === 'RECONECTANDO' ? 'CONECTADO' : player.connection,
    isSpectator: player.isSpectator,
    joinedAt: player.joinedAt,
    pronto: player.pronto,
    silenciado: player.silenciado,
    emSegundoPlano: player.emSegundoPlano,
    ...(player.bot ? { bot: { difficulty: player.bot.difficulty } } : {}),
  };
}

export const isBot = (player: RoomPlayer): boolean => player.bot !== null;
export const foiExpulso = (player: RoomPlayer): boolean => player.expulsoEm !== null;

export function isPresent(player: RoomPlayer): boolean {
  return player.connection !== 'SAIU' && player.connection !== 'REMOVIDO';
}

export function isOnline(player: RoomPlayer): boolean {
  return player.connection === 'CONECTADO' || player.connection === 'RECONECTANDO';
}

/**
 * Quem está ao volante do personagem neste passo.
 *
 * Num jogo de reflexo não há como pausar a arena para esperar quem caiu, como
 * o dominó faz — os outros quatro estão no meio de uma fuga. Então o bot
 * assume na hora em que o socket cai (ou o celular vai para segundo plano) e
 * devolve o controle quando a pessoa volta. Ela volta viva, se o bot foi bem.
 */
export function dirigidoPorBot(player: RoomPlayer): boolean {
  return player.bot !== null || player.connection !== 'CONECTADO' || player.emSegundoPlano;
}
