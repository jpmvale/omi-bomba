/**
 * Contrato cliente ↔ servidor. Fonte única de tipos.
 *
 * Só tipos e constantes: os schemas de runtime moram em
 * `@omi-bomba/protocol/validate`, que puxa o zod e nunca entra no bundle do
 * cliente.
 *
 * Dois ritmos de sincronização, porque o jogo tem dois ritmos:
 *
 * - **retrato da sala** (`room:state`) a cada mudança de sala — quem entrou,
 *   pronto, opções, começo e fim de partida. Como no dominó.
 * - **quadro do jogo** (`game:frame`) a cada passo do motor, 20 por segundo,
 *   igual para todos (não há informação escondida de um jogador para outro; o
 *   que é segredo — os itens dentro das caixas — já sai cortado pela projeção).
 *   O quadro não sobe `stateVersion`: senão cada passo viraria um retrato
 *   inteiro da sala, vinte vezes por segundo.
 */

import type { Dir, MatchOptions, MatchView, PlayerId } from '@omi-bomba/rules';
import type { BotDifficulty } from '@omi-bomba/bot';

export type { BotDifficulty } from '@omi-bomba/bot';
export { BOT_DIFFICULTIES } from '@omi-bomba/bot';

export const PROTOCOL_VERSION = 1;

export interface Envelope<T = unknown> {
  v: typeof PROTOCOL_VERSION;
  /** uuid do cliente; ecoado em ack/erro. Base da idempotência. */
  id: string;
  type: string;
  ts: number;
  payload: T;
}

// ---------------------------------------------------------------------------
// Personagens
// ---------------------------------------------------------------------------

/**
 * Os personagens da casa. Originais: nomes de coisa que pega fogo, e o desenho
 * é feito em código no cliente (`app/src/jogo/personagens.ts`). Só visual — o
 * personagem não muda velocidade nem alcance, para a escolha ser de gosto e
 * não de estratégia.
 *
 * A ordem é o contrato: o índice vira cor no cliente.
 */
export const PERSONAGENS = ['pavio', 'brasa', 'faisca', 'nevoa', 'trovao', 'musgo', 'coral', 'carvao'] as const;
export type Personagem = (typeof PERSONAGENS)[number];

export const NOME_DO_PERSONAGEM: Record<Personagem, string> = {
  pavio: 'Pavio',
  brasa: 'Brasa',
  faisca: 'Faísca',
  nevoa: 'Névoa',
  trovao: 'Trovão',
  musgo: 'Musgo',
  coral: 'Coral',
  carvao: 'Carvão',
};

// ---------------------------------------------------------------------------
// Sala
// ---------------------------------------------------------------------------

export type RoomStatus = 'LOBBY' | 'EM_PARTIDA' | 'FIM_DE_PARTIDA' | 'ENCERRADA';

/** `RECONECTANDO` é interno ao servidor e nunca sai para o cliente. */
export type ConnectionStatus = 'CONECTADO' | 'DESCONECTADO' | 'REMOVIDO' | 'SAIU';

export interface PublicPlayer {
  id: PlayerId;
  nickname: string;
  personagem: Personagem;
  connection: ConnectionStatus;
  isSpectator: boolean;
  joinedAt: number;
  pronto: boolean;
  silenciado: boolean;
  emSegundoPlano: boolean;
  /** Presente só em bot. */
  bot?: { difficulty: BotDifficulty };
}

/** O apelido é COPIADO no envio: histórico não muda de autor depois de dito. */
export interface ChatMessage {
  id: string;
  playerId: PlayerId;
  nickname: string;
  text: string;
  at: number;
  spectator: boolean;
}

/** O retrato da sala. Igual para todos: não há segredo por jogador. */
export interface RoomView {
  code: string;
  status: RoomStatus;
  hostId: PlayerId | null;
  options: MatchOptions;
  stateVersion: number;
  players: PublicPlayer[];
  /** Ordem dos assentos no lobby. */
  ordem: PlayerId[];
  match: MatchView | null;
}

// ---------------------------------------------------------------------------
// Comandos: cliente → servidor
// ---------------------------------------------------------------------------

export type Command =
  | { type: 'room:resync'; payload: Record<string, never> }
  | { type: 'player:setProfile'; payload: { nickname: string; personagem: Personagem } }
  /** O celular avisando que foi para segundo plano: um bot segura o personagem. */
  | { type: 'player:background'; payload: { emSegundoPlano: boolean } }
  | { type: 'player:setPronto'; payload: { pronto: boolean } }
  | { type: 'player:leave'; payload: Record<string, never> }
  | { type: 'player:setSpectator'; payload: { spectator: boolean } }
  | { type: 'chat:send'; payload: { text: string } }
  | { type: 'host:silenciar'; payload: { playerId: PlayerId; silenciado: boolean } }
  | { type: 'host:kick'; payload: { playerId: PlayerId } }
  | { type: 'host:addBot'; payload: { difficulty: BotDifficulty } }
  | { type: 'host:removeBot'; payload: { playerId: PlayerId } }
  | { type: 'host:setOptions'; payload: { options: { [K in keyof MatchOptions]?: MatchOptions[K] | undefined } } }
  | { type: 'host:startMatch'; payload: Record<string, never> }
  | { type: 'host:endMatch'; payload: Record<string, never> }
  | { type: 'host:rematch'; payload: Record<string, never> }
  | { type: 'host:toLobby'; payload: Record<string, never> }
  /**
   * O que está apertado agora. Vai a cada MUDANÇA (apertou, soltou, bomba), não
   * a cada quadro. Sem `ack` e fora da idempotência: perder um é recuperado
   * pelo próximo, e um `ack` por tecla dobraria o tráfego à toa.
   */
  | { type: 'game:input'; payload: { matchId: string; dir: Dir | null; bomba: boolean } };

export type CommandType = Command['type'];

// ---------------------------------------------------------------------------
// Eventos: servidor → cliente
// ---------------------------------------------------------------------------

export type ServerEvent =
  /** Retrato completo, com o chat. Chega ao conectar. */
  | { type: 'room:snapshot'; payload: RoomView & { chat: ChatMessage[] } }
  /** Retrato depois de uma mudança de sala. Sem o chat. */
  | { type: 'room:state'; payload: RoomView }
  /** Um passo do motor. A grade só vem quando mudou. */
  | { type: 'game:frame'; payload: MatchView }
  | { type: 'chat:message'; payload: { message: ChatMessage } }
  | { type: 'system:notice'; payload: { code: string; params?: Record<string, unknown> } }
  | { type: 'ack'; payload: { commandId: string } }
  | { type: 'error'; payload: ErrorPayload };

export type ServerEventType = ServerEvent['type'];

export interface ServerEnvelope<T = unknown> extends Envelope<T> {
  stateVersion: number;
}

export const ERROR_CODES = {
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_FULL: 'ROOM_FULL',
  INVALID_TOKEN: 'INVALID_TOKEN',
  NOT_HOST: 'NOT_HOST',
  WRONG_STATUS: 'WRONG_STATUS',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  RATE_LIMITED: 'RATE_LIMITED',
  SESSION_TAKEN: 'SESSION_TAKEN',
  STALE_MOVE: 'STALE_MOVE',
  PROTOCOL_VERSION: 'PROTOCOL_VERSION',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface ErrorPayload {
  commandId?: string;
  code: ErrorCode;
  params?: Record<string, unknown>;
}

/**
 * Fechamentos do WebSocket. Dizem ao cliente se deve insistir: um deploy pede
 * reconexão imediata; um token inválido pede recomeçar.
 */
export const CLOSE_CODES = {
  SERVER_RESTART: 4001,
  INVALID_TOKEN: 4003,
  ROOM_NOT_FOUND: 4004,
  SESSION_TAKEN: 4009,
} as const;

export type CloseCode = (typeof CLOSE_CODES)[keyof typeof CLOSE_CODES];

export function shouldReconnect(closeCode: number): boolean {
  return closeCode !== CLOSE_CODES.SESSION_TAKEN &&
    closeCode !== CLOSE_CODES.INVALID_TOKEN &&
    closeCode !== CLOSE_CODES.ROOM_NOT_FOUND;
}

// ---------------------------------------------------------------------------
// Limites
// ---------------------------------------------------------------------------

export const LIMITS = {
  commandsPerWindow: 20,
  commandWindowMs: 10_000,
  /**
   * Entrada de jogo tem teto próprio: 20 comandos em 10 s é o ritmo de lobby,
   * e qualquer pessoa jogando aperta e solta setas mais que isso. 30 por
   * segundo cobre o dedo mais nervoso e ainda barra um laço sem freio.
   */
  inputsPerWindow: 30,
  inputWindowMs: 1_000,
  maxMessageBytes: 16 * 1024,
  maxPlayers: 5,
  minPlayers: 2,
  /** Uma sala só de bots não é jogo, é demonstração. */
  maxBots: 4,
  maxSpectators: 6,
  idempotencyWindowMs: 30_000,
  chatTextMax: 280,
  chatMinIntervalMs: 1_000,
  chatHistoryMax: 200,
  /** Socket caiu: um bot segura o personagem já. Depois disto, conta como fora. */
  transportGraceMs: 10_000,
  roomMaxLifeMs: 4 * 60 * 60_000,
  lobbyIdleMs: 15 * 60_000,
} as const;

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 16;
export const ROOM_CODE_LENGTH = 5;
/** Sem `I`, `O`, `0`, `1`: confundem ao ditar por voz. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
