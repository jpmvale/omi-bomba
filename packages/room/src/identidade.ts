/**
 * Quem é quem na sala: apelido único e personagem único entre quem joga.
 *
 * O personagem é único só entre os SENTADOS: são eles que aparecem na arena,
 * e dois Pavios correndo juntos seriam a mesma pessoa a 360 px. Quem assiste
 * pode repetir — e, ao sentar, ganha o primeiro livre se o seu estiver tomado.
 *
 * Uma implementação usada pela entrada, pelo `setProfile` e por quem senta,
 * como no dominó: regra duplicada é regra que só vale onde alguém lembrou.
 */

import { PERSONAGENS, type Personagem } from '@omi-bomba/protocol';
import type { PlayerId } from '@omi-bomba/rules';
import { isPresent, type Room, type RoomPlayer } from './types.js';

const outros = (room: Room, exceto?: PlayerId): RoomPlayer[] =>
  room.players.filter((p) => isPresent(p) && p.id !== exceto);

const mesmoApelido = (a: string, b: string): boolean =>
  a.trim().toLocaleLowerCase('pt-BR') === b.trim().toLocaleLowerCase('pt-BR');

export interface Conflito {
  apelido: boolean;
  personagem: boolean;
}

export function conflitosDe(room: Room, playerId: PlayerId, nickname: string, personagem: Personagem): Conflito {
  const demais = outros(room, playerId);
  const eu = room.players.find((p) => p.id === playerId);
  return {
    apelido: demais.some((p) => mesmoApelido(p.nickname, nickname)),
    personagem: eu !== undefined && !eu.isSpectator &&
      demais.some((p) => !p.isSpectator && p.personagem === personagem),
  };
}

export const temConflito = (c: Conflito): boolean => c.apelido || c.personagem;

/**
 * Apelido livre a partir do desejado. Sufixa em vez de recusar: na ENTRADA,
 * quem chegou depois não tem culpa de outra pessoa se chamar igual.
 */
export function apelidoLivre(room: Room, desejado: string, exceto?: PlayerId): string {
  const demais = outros(room, exceto);
  const tomado = (nome: string) => demais.some((p) => mesmoApelido(p.nickname, nome));
  if (!tomado(desejado)) return desejado;
  for (let sufixo = 2; sufixo <= demais.length + 2; sufixo++) {
    const candidato = `${desejado} ${sufixo}`;
    if (!tomado(candidato)) return candidato;
  }
  return `${desejado} ${demais.length + 2}`;
}

/** O desejado se estiver livre entre os sentados; senão, o primeiro livre. */
export function personagemLivre(room: Room, desejado: Personagem | undefined, exceto?: PlayerId): Personagem {
  const tomados = new Set(outros(room, exceto).filter((p) => !p.isSpectator).map((p) => p.personagem));
  if (desejado && !tomados.has(desejado)) return desejado;
  return PERSONAGENS.find((p) => !tomados.has(p)) ?? desejado ?? PERSONAGENS[0];
}

/**
 * Desfaz repetição entre os sentados, na ordem de quem sentou primeiro: quem
 * já tinha o personagem fica com ele, quem chegou depois troca.
 */
export function garantirPersonagens(room: Room): Room {
  const usados = new Set<Personagem>();
  let mudou = false;
  const sentados = room.players
    .filter((p) => isPresent(p) && !p.isSpectator)
    .sort((a, b) => a.joinedAt - b.joinedAt);
  const troca = new Map<PlayerId, Personagem>();
  for (const p of sentados) {
    if (!usados.has(p.personagem)) {
      usados.add(p.personagem);
      continue;
    }
    const livre = PERSONAGENS.find((x) => !usados.has(x)) ?? p.personagem;
    usados.add(livre);
    troca.set(p.id, livre);
    mudou = true;
  }
  if (!mudou) return room;
  return { ...room, players: room.players.map((p) => (troca.has(p.id) ? { ...p, personagem: troca.get(p.id)! } : p)) };
}
