/**
 * Ciclo de vida da sala, conexão e comandos.
 *
 * Mesma arquitetura do dominó e do FDP: toda mudança de sala passa por
 * `commit`, que sobe a versão; o tempo entra por `ctx.now`; a regra do jogo é
 * do motor. A diferença está no relógio: aqui a partida anda sozinha, 20 passos
 * por segundo, e isso mora em `tick.ts`.
 */

import { apelidoLivre, conflitosDe, garantirPersonagens, personagemLivre } from './identidade.js';
import { garantirHost, passarHost } from './anfitriao.js';
import {
  LIMITS,
  NICKNAME_MAX,
  type BotDifficulty,
  type ChatMessage,
  type Command,
  type RoomView,
} from '@omi-bomba/protocol';
import {
  aplicarEntrada,
  createMatch,
  DEFAULT_OPTIONS,
  endMatch,
  project,
  TICK_MS,
  type PlayerId,
} from '@omi-bomba/rules';
import {
  isOnline,
  isPresent,
  foiExpulso,
  toPublicPlayer,
  type Emission,
  type JoinParams,
  type Room,
  type RoomCtx,
  type RoomPlayer,
  type RoomResult,
} from './types.js';

type FailCode = 'ROOM_FULL' | 'NOT_HOST' | 'WRONG_STATUS' | 'VALIDATION_FAILED' | 'STALE_MOVE';

const failWith = (code: FailCode, motivo: string): RoomResult => ({ ok: false, code, motivo });

const all = (event: Emission['event']): Emission => ({ audience: 'ALL', event });
const notice = (code: string, params?: Record<string, unknown>): Emission =>
  all({ type: 'system:notice', payload: params ? { code, params } : { code } });

/** Toda mudança de sala passa por aqui: `stateVersion` nunca é esquecido. */
export function commit(room: Room, ctx: RoomCtx, emissions: Emission[]): RoomResult {
  const sealed = sealMatchEnd(room);
  return {
    ok: true,
    room: { ...sealed, stateVersion: sealed.stateVersion + 1, lastActivityAt: ctx.now },
    emissions,
  };
}

/** O motor encerra a partida; é aqui que a sala vai junto para o fim. */
export function sealMatchEnd(room: Room): Room {
  if (room.status !== 'EM_PARTIDA') return room;
  if (!room.match || room.match.endReason === null) return room;
  return { ...room, status: 'FIM_DE_PARTIDA', proximoPassoEm: null };
}

const replace = (players: RoomPlayer[], id: PlayerId, patch: Partial<RoomPlayer>): RoomPlayer[] =>
  players.map((p) => (p.id === id ? { ...p, ...patch } : p));

// ---------------------------------------------------------------------------
// Criação e entrada
// ---------------------------------------------------------------------------

export function createRoom(code: string, host: JoinParams, ctx: RoomCtx): Room {
  return {
    code,
    status: 'LOBBY',
    hostId: host.playerId,
    players: [newPlayer(host, ctx.now, false)],
    ordem: [host.playerId],
    options: { ...DEFAULT_OPTIONS },
    match: null,
    proximoPassoEm: null,
    stateVersion: 1,
    createdAt: ctx.now,
    lastActivityAt: ctx.now,
    chat: [],
  };
}

function newPlayer(params: JoinParams, now: number, isSpectator: boolean): RoomPlayer {
  return {
    id: params.playerId,
    nickname: params.nickname,
    personagem: params.personagem,
    connection: 'CONECTADO',
    isSpectator,
    joinedAt: now,
    lastSeenAt: now,
    socketLostAt: null,
    emSegundoPlano: false,
    pronto: false,
    silenciado: false,
    expulsoEm: null,
    lastChatAt: null,
    bot: null,
  };
}

/** Nomes de fogos de festa junina: bot tem cara de bot, mas da casa. */
const NOMES_DE_BOT = ['Bot Estopim', 'Bot Traque', 'Bot Rojão', 'Bot Busca-pé', 'Bot Chuvinha'] as const;

function newBot(room: Room, difficulty: BotDifficulty, ctx: RoomCtx): RoomPlayer {
  const usados = new Set(room.players.filter(isPresent).map((p) => p.nickname));
  const nickname = apelidoLivre(room, NOMES_DE_BOT.find((n) => !usados.has(n)) ?? 'Bot');
  const existentes = new Set(room.players.map((p) => p.id));
  let id = ctx.newId();
  for (let n = 2; existentes.has(id); n++) id = `${ctx.newId()}-${n}`;
  return {
    ...newPlayer({ playerId: id, nickname, personagem: personagemLivre(room, undefined) }, ctx.now, false),
    // Bot nasce pronto: não tem o que confirmar.
    pronto: true,
    bot: { difficulty },
  };
}

export const seatedPlayers = (room: Room): RoomPlayer[] =>
  room.players.filter((p) => isPresent(p) && !p.isSpectator);

export const spectators = (room: Room): RoomPlayer[] =>
  room.players.filter((p) => isPresent(p) && p.isSpectator);

const botsOf = (room: Room): RoomPlayer[] => room.players.filter((p) => isPresent(p) && p.bot !== null);

/** Os assentos na ordem de chegada, derivados sempre: nunca apontam para um fantasma. */
export function ordemDosAssentos(room: Room): PlayerId[] {
  const sentados = seatedPlayers(room);
  const ids = new Set(sentados.map((p) => p.id));
  const ordem = room.ordem.filter((id) => ids.has(id));
  for (const p of [...sentados].sort((a, b) => a.joinedAt - b.joinedAt)) {
    if (!ordem.includes(p.id)) ordem.push(p.id);
  }
  return ordem;
}

/** Depois de qualquer troca de assento: ordem refeita e personagens sem repetição. */
const arrumar = (room: Room): Room => garantirPersonagens({ ...room, ordem: ordemDosAssentos(room) });

export function join(room: Room, params: JoinParams, ctx: RoomCtx): RoomResult {
  if (room.status === 'ENCERRADA') return failWith('WRONG_STATUS', 'SALA_ENCERRADA');

  const existing = room.players.find((p) => p.id === params.playerId);
  if (existing) return reconnect(room, params.playerId, ctx);

  // Sala cheia ou partida em andamento: entra para assistir e joga na próxima.
  const emJogo = room.status !== 'LOBBY';
  const cheia = seatedPlayers(room).length >= LIMITS.maxPlayers;
  const asSpectator = emJogo || cheia;
  if (asSpectator && spectators(room).length >= LIMITS.maxSpectators) {
    return failWith('ROOM_FULL', 'SALA_LOTADA');
  }

  const player = newPlayer(
    {
      ...params,
      nickname: apelidoLivre(room, params.nickname),
      personagem: asSpectator ? params.personagem : personagemLivre(room, params.personagem),
    },
    ctx.now,
    asSpectator,
  );
  return commit(arrumar({ ...room, players: [...room.players, player] }), ctx, []);
}

// ---------------------------------------------------------------------------
// Conexão
// ---------------------------------------------------------------------------

export function reconnect(room: Room, playerId: PlayerId, ctx: RoomCtx): RoomResult {
  const player = room.players.find((p) => p.id === playerId);
  if (!player) return failWith('VALIDATION_FAILED', 'JOGADOR_DESCONHECIDO');
  if (!isPresent(player)) return failWith('WRONG_STATUS', 'JOGADOR_SAIU');
  if (foiExpulso(player)) return failWith('WRONG_STATUS', 'EXPULSO');

  const players = replace(room.players, playerId, {
    connection: 'CONECTADO',
    socketLostAt: null,
    lastSeenAt: ctx.now,
    emSegundoPlano: false,
  });
  const emissions: Emission[] = [];
  let next = garantirHost({ ...room, players }, emissions);
  // O bot que segurava o personagem pode ter deixado uma direção apertada.
  // A pessoa volta com as mãos livres.
  if (next.match) next = { ...next, match: aplicarEntrada(next.match, playerId, { dir: null, bomba: false }) };
  return commit(next, ctx, emissions);
}

/** Socket caiu. O bot assume o personagem já no próximo passo. */
export function disconnect(room: Room, playerId: PlayerId, ctx: RoomCtx): RoomResult {
  const player = room.players.find((p) => p.id === playerId);
  if (!player || !isPresent(player)) return failWith('VALIDATION_FAILED', 'JOGADOR_DESCONHECIDO');
  if (!isOnline(player)) return { ok: true, room, emissions: [] };
  const players = replace(room.players, playerId, {
    connection: 'RECONECTANDO',
    socketLostAt: ctx.now,
    lastSeenAt: ctx.now,
  });
  // Sem versão nova: para o resto da sala, nada mudou ainda.
  return { ok: true, room: { ...room, players }, emissions: [] };
}

const emPartida = (room: Room): boolean => room.status === 'EM_PARTIDA';

const sentadoNaPartida = (room: Room, id: PlayerId): boolean =>
  room.match !== null && room.match.playerOrder.includes(id);

export function leave(room: Room, playerId: PlayerId, ctx: RoomCtx): RoomResult {
  const player = room.players.find((p) => p.id === playerId);
  if (!player || !isPresent(player)) return failWith('VALIDATION_FAILED', 'JOGADOR_DESCONHECIDO');

  const emissions: Emission[] = [];
  let next: Room;

  // Sair no meio da partida não tira o personagem da arena: um bot assume, com
  // os itens e o placar, e a partida segue.
  if (emPartida(room) && sentadoNaPartida(room, playerId) && player.bot === null) {
    const trocado = trocarPorBot(room, player, ctx);
    next = trocado.room;
    emissions.push(notice('BOT_ASSUMIU', { apelido: player.nickname, bot: trocado.assento.nickname, motivo: 'SAIU' }));
  } else {
    next = { ...room, players: replace(room.players, playerId, { connection: 'SAIU' }) };
  }

  next = garantirHost(arrumar(next), emissions);
  return commit(next, ctx, emissions);
}

// ---------------------------------------------------------------------------
// Bot assumindo assento
// ---------------------------------------------------------------------------

const DIFICULDADE_DO_SUBSTITUTO: BotDifficulty = 'MEDIO';

/**
 * Troca a PESSOA pelo bot no assento, de vez. O `playerId` continua o mesmo —
 * é ele que o motor usa para achar o personagem.
 */
export function trocarPorBot(room: Room, alvo: RoomPlayer, ctx: RoomCtx): { room: Room; assento: RoomPlayer } {
  const cabe = `Bot (${alvo.nickname})`;
  const nickname = apelidoLivre(
    room,
    cabe.length <= NICKNAME_MAX ? cabe : `Bot (${alvo.nickname.slice(0, NICKNAME_MAX - 6)})`,
    alvo.id,
  );
  const assento: RoomPlayer = {
    ...alvo,
    nickname,
    bot: { difficulty: DIFICULDADE_DO_SUBSTITUTO },
    // Marca o token da pessoa como inválido para este assento.
    expulsoEm: ctx.now,
    connection: 'CONECTADO',
    socketLostAt: null,
    emSegundoPlano: false,
    pronto: true,
    silenciado: false,
  };
  return { room: { ...room, players: replace(room.players, alvo.id, assento) }, assento };
}

// ---------------------------------------------------------------------------
// Comandos
// ---------------------------------------------------------------------------

export function applyCommand(room: Room, playerId: PlayerId, command: Command, ctx: RoomCtx): RoomResult {
  const player = room.players.find((p) => p.id === playerId);
  if (!player || !isPresent(player)) return failWith('VALIDATION_FAILED', 'JOGADOR_DESCONHECIDO');
  if (command.type.startsWith('host:') && room.hostId !== playerId) {
    return failWith('NOT_HOST', 'COMANDO_EXIGE_HOST');
  }

  switch (command.type) {
    case 'room:resync':
      return { ok: true, room, emissions: [] };

    case 'game:input':
      return applyInput(room, player, command.payload);

    case 'player:leave':
      return leave(room, playerId, ctx);

    case 'player:background': {
      if (player.emSegundoPlano === command.payload.emSegundoPlano) return { ok: true, room, emissions: [] };
      const players = replace(room.players, playerId, {
        emSegundoPlano: command.payload.emSegundoPlano,
        lastSeenAt: ctx.now,
      });
      return commit({ ...room, players }, ctx, []);
    }

    case 'player:setPronto': {
      if (room.status !== 'LOBBY') return failWith('WRONG_STATUS', 'SO_NO_LOBBY');
      if (player.isSpectator) return failWith('VALIDATION_FAILED', 'ESPECTADOR_NAO_JOGA');
      if (player.pronto === command.payload.pronto) return { ok: true, room, emissions: [] };
      return commit({ ...room, players: replace(room.players, playerId, { pronto: command.payload.pronto }) }, ctx, []);
    }

    case 'player:setProfile': {
      if (room.status !== 'LOBBY') return failWith('WRONG_STATUS', 'SO_NO_LOBBY');
      const conflito = conflitosDe(room, playerId, command.payload.nickname, command.payload.personagem);
      if (conflito.apelido) return failWith('VALIDATION_FAILED', 'APELIDO_TOMADO');
      if (conflito.personagem) return failWith('VALIDATION_FAILED', 'PERSONAGEM_TOMADO');
      return commit({
        ...room,
        players: replace(room.players, playerId, { nickname: command.payload.nickname, personagem: command.payload.personagem }),
      }, ctx, []);
    }

    case 'player:setSpectator': {
      // Só no lobby: no meio da partida, sair da arena é `player:leave`.
      if (room.status !== 'LOBBY') return failWith('WRONG_STATUS', 'SO_NO_LOBBY');
      if (player.bot !== null) return failWith('VALIDATION_FAILED', 'BOT_NAO_ASSISTE');
      const quer = command.payload.spectator;
      if (quer === player.isSpectator) return { ok: true, room, emissions: [] };
      if (quer && spectators(room).length >= LIMITS.maxSpectators) return failWith('ROOM_FULL', 'ESPECTADORES_LOTADOS');
      if (!quer && seatedPlayers(room).length >= LIMITS.maxPlayers) return failWith('ROOM_FULL', 'ARENA_CHEIA');
      const players = replace(room.players, playerId, {
        isSpectator: quer,
        pronto: false,
        // Quem senta ganha o personagem que pediu se estiver livre, senão o primeiro livre.
        ...(quer ? {} : { personagem: personagemLivre(room, player.personagem, playerId) }),
      });
      const emissions: Emission[] = [];
      const next = quer && room.hostId === playerId
        ? passarHost({ ...room, players }, playerId, emissions)
        : { ...room, players };
      return commit(arrumar(next), ctx, emissions);
    }

    case 'chat:send': {
      if (room.status === 'ENCERRADA') return failWith('WRONG_STATUS', 'SALA_ENCERRADA');
      if (player.bot !== null) return failWith('VALIDATION_FAILED', 'BOT_NAO_FALA');
      // Recusado no servidor, não só escondido na tela.
      if (player.silenciado) return failWith('VALIDATION_FAILED', 'SILENCIADO');
      const texto = command.payload.text.trim();
      if (texto.length === 0 || texto.length > LIMITS.chatTextMax) {
        return failWith('VALIDATION_FAILED', 'MENSAGEM_INVALIDA');
      }
      if (player.lastChatAt !== null && ctx.now - player.lastChatAt < LIMITS.chatMinIntervalMs) {
        return failWith('VALIDATION_FAILED', 'RAPIDO_DEMAIS');
      }
      const mensagem: ChatMessage = {
        id: ctx.newId(),
        playerId,
        nickname: player.nickname,
        text: texto,
        at: ctx.now,
        spectator: player.isSpectator,
      };
      return commit({
        ...room,
        chat: [...room.chat, mensagem].slice(-LIMITS.chatHistoryMax),
        players: replace(room.players, playerId, { lastChatAt: ctx.now }),
      }, ctx, [all({ type: 'chat:message', payload: { message: mensagem } })]);
    }

    case 'host:silenciar': {
      const alvoId = command.payload.playerId;
      if (alvoId === playerId) return failWith('VALIDATION_FAILED', 'HOST_NAO_SE_SILENCIA');
      const alvo = room.players.find((p) => p.id === alvoId && isPresent(p));
      if (!alvo) return failWith('VALIDATION_FAILED', 'JOGADOR_DESCONHECIDO');
      if (alvo.bot !== null) return failWith('VALIDATION_FAILED', 'BOT_NAO_FALA');
      if (alvo.silenciado === command.payload.silenciado) return { ok: true, room, emissions: [] };
      return commit({ ...room, players: replace(room.players, alvoId, { silenciado: command.payload.silenciado }) }, ctx, []);
    }

    case 'host:kick': {
      const alvoId = command.payload.playerId;
      if (alvoId === playerId) return failWith('VALIDATION_FAILED', 'HOST_NAO_SE_EXPULSA');
      const alvo = room.players.find((p) => p.id === alvoId && isPresent(p));
      if (!alvo) return failWith('VALIDATION_FAILED', 'JOGADOR_DESCONHECIDO');
      if (alvo.bot !== null && !emPartida(room)) return failWith('VALIDATION_FAILED', 'USE_REMOVER_BOT');

      // Expulsar da partida não tira o personagem: um bot assume e a rodada segue.
      if (emPartida(room) && sentadoNaPartida(room, alvoId)) {
        if (alvo.bot !== null) return failWith('VALIDATION_FAILED', 'BOT_NAO_SAI_NA_PARTIDA');
        const trocado = trocarPorBot(room, alvo, ctx);
        return commit(trocado.room, ctx, [
          notice('BOT_ASSUMIU', { apelido: alvo.nickname, bot: trocado.assento.nickname, motivo: 'EXPULSO' }),
        ]);
      }

      const next = { ...room, players: replace(room.players, alvoId, { connection: 'REMOVIDO' as const, expulsoEm: ctx.now }) };
      return commit(arrumar(next), ctx, [notice('EXPULSO', { apelido: alvo.nickname, playerId: alvoId })]);
    }

    case 'host:addBot': {
      if (room.status !== 'LOBBY') return failWith('WRONG_STATUS', 'SO_NO_LOBBY');
      if (botsOf(room).length >= LIMITS.maxBots) return failWith('ROOM_FULL', 'BOTS_DEMAIS');
      if (seatedPlayers(room).length >= LIMITS.maxPlayers) return failWith('ROOM_FULL', 'ARENA_CHEIA');
      const bot = newBot(room, command.payload.difficulty, ctx);
      return commit(arrumar({ ...room, players: [...room.players, bot] }), ctx, []);
    }

    case 'host:removeBot': {
      if (room.status !== 'LOBBY') return failWith('WRONG_STATUS', 'SO_NO_LOBBY');
      const alvo = room.players.find((p) => p.id === command.payload.playerId && isPresent(p));
      if (!alvo || alvo.bot === null) return failWith('VALIDATION_FAILED', 'NAO_E_BOT');
      return commit(arrumar({ ...room, players: room.players.filter((p) => p.id !== alvo.id) }), ctx, []);
    }

    case 'host:setOptions': {
      if (room.status !== 'LOBBY') return failWith('WRONG_STATUS', 'SO_NO_LOBBY');
      // Junta com o que já estava: o anfitrião manda só o campo que mudou.
      const pedido = command.payload.options;
      const options = {
        vitorias: pedido.vitorias ?? room.options.vitorias,
        fechamento: pedido.fechamento ?? room.options.fechamento,
      };
      return commit({ ...room, options }, ctx, []);
    }

    case 'host:startMatch':
      return startMatch(room, ctx);

    case 'host:endMatch': {
      if (!emPartida(room) || !room.match) return failWith('WRONG_STATUS', 'SEM_PARTIDA');
      return commit({
        ...room,
        status: 'FIM_DE_PARTIDA',
        match: endMatch(room.match, 'ENCERRADA_PELO_HOST'),
        proximoPassoEm: null,
      }, ctx, []);
    }

    case 'host:rematch': {
      if (room.status !== 'FIM_DE_PARTIDA') return failWith('WRONG_STATUS', 'SEM_FIM_DE_PARTIDA');
      // Revanche com o mesmo grupo: preserva o pronto, não pede cinco toques.
      const players = room.players.map((p) => (isPresent(p) && !p.isSpectator ? { ...p, pronto: true } : p));
      return startMatch({ ...room, status: 'LOBBY', match: null, proximoPassoEm: null, players }, ctx);
    }

    case 'host:toLobby': {
      if (room.status !== 'FIM_DE_PARTIDA') return failWith('WRONG_STATUS', 'SEM_FIM_DE_PARTIDA');
      // Voltar para arrumar a sala zera o pronto: o grupo vai mudar.
      const players = room.players.map((p) => (isPresent(p) && p.bot === null ? { ...p, pronto: false } : p));
      return commit(arrumar({ ...room, status: 'LOBBY', match: null, proximoPassoEm: null, players }), ctx, []);
    }

    default:
      return failWith('VALIDATION_FAILED', 'COMANDO_DESCONHECIDO');
  }
}

/**
 * Tecla apertada. NÃO passa por `commit`: não é mudança de sala, e subir a
 * versão aqui mandaria o retrato inteiro a todos a cada seta. O efeito aparece
 * no próximo quadro do motor, como tudo na arena.
 */
function applyInput(
  room: Room,
  player: RoomPlayer,
  payload: Extract<Command, { type: 'game:input' }>['payload'],
): RoomResult {
  if (room.status !== 'EM_PARTIDA' || !room.match) return failWith('WRONG_STATUS', 'SEM_PARTIDA');
  if (payload.matchId !== room.match.id) return failWith('STALE_MOVE', 'PARTIDA_ANTIGA');
  if (player.isSpectator || !sentadoNaPartida(room, player.id)) return failWith('VALIDATION_FAILED', 'ESPECTADOR_NAO_JOGA');
  if (player.bot !== null) return { ok: true, room, emissions: [] };
  return {
    ok: true,
    room: { ...room, match: aplicarEntrada(room.match, player.id, { dir: payload.dir, bomba: payload.bomba }) },
    emissions: [],
  };
}

export function startMatch(room: Room, ctx: RoomCtx): RoomResult {
  if (room.status !== 'LOBBY') return failWith('WRONG_STATUS', 'SO_NO_LOBBY');
  const arrumada = arrumar(room);
  const ordem = arrumada.ordem;
  const sentados = seatedPlayers(arrumada);
  if (ordem.length < LIMITS.minPlayers) return failWith('WRONG_STATUS', 'JOGADORES_INSUFICIENTES');
  if (!sentados.some((p) => p.bot === null)) return failWith('WRONG_STATUS', 'SO_BOTS_NA_ARENA');
  if (sentados.some((p) => !p.pronto)) return failWith('WRONG_STATUS', 'FALTA_PRONTO');

  const match = createMatch({
    matchId: ctx.newId(),
    seed: ctx.randomSeed(),
    playerIds: ordem,
    options: arrumada.options,
  });
  return commit({ ...arrumada, status: 'EM_PARTIDA', match, proximoPassoEm: ctx.now + TICK_MS }, ctx, []);
}

// ---------------------------------------------------------------------------
// Retrato
// ---------------------------------------------------------------------------

/** O retrato da sala. Sem o chat — ver `snapshotFor`. */
export function viewFor(room: Room): RoomView {
  return {
    code: room.code,
    status: room.status,
    hostId: room.hostId,
    options: room.options,
    stateVersion: room.stateVersion,
    players: room.players.filter(isPresent).map(toPublicPlayer),
    ordem: room.match && room.status !== 'LOBBY' ? room.match.playerOrder : ordemDosAssentos(room),
    match: room.match ? project(room.match) : null,
  };
}

export function snapshotFor(room: Room): Emission['event'] {
  return { type: 'room:snapshot', payload: { ...viewFor(room), chat: room.chat } };
}
