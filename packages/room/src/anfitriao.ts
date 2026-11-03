/**
 * Quem manda na sala, e quem passa a mandar quando o dono some.
 *
 * Herdado do dominó, onde a regra chegou a existir em dois lugares (um por
 * comando, outro por relógio) e envelheceu diferente em cada um. Aqui é uma
 * função só, e os dois caminhos a chamam.
 */

import type { PlayerId } from '@omi-bomba/rules';
import { isOnline, isPresent, type Emission, type Room } from './types.js';

/** Mesmo `all` de `room.ts` e `tick.ts`: um evento para a mesa inteira. */
const all = (event: Emission['event']): Emission => ({ audience: 'ALL', event });

/**
 * Escolhe o próximo anfitrião: **gente, e de preferência sentada**.
 *
 * As duas condições vêm de defeitos observados, e a ordem entre elas importa.
 *
 * **Bot nunca herda a mesa.** Bot não aperta botão: uma sala com host-bot fica
 * viva, com gente dentro, e sem nenhum caminho para começar a partida. A tela
 * diz "esperando Bot Ada começar" e a espera não acaba nunca.
 *
 * **Sentado antes de espectador**, porque quem assiste não pode começar a
 * partida, mexer nas opções nem expulsar ninguém. Mas espectador entra como
 * último recurso: dessa situação alguém se senta e a sala volta a andar
 * sozinha, e é melhor que host nenhum.
 *
 * Sem candidato humano, o host **não muda**. Manter quem estava é o menos ruim:
 * ele pode voltar, e a alternativa é a sala governada por um bot ou por
 * ninguém.
 *
 * `evitando` é quem NÃO pode receber — o próprio host que está saindo. Sem ele,
 * quem acabou de virar espectador seria "eleito" de volta por ainda estar
 * online.
 */
export function passarHost(
  room: Room,
  evitando: PlayerId | null,
  emissions: Emission[],
): Room {
  const disponiveis = room.players
    .filter((p) => p.id !== evitando && isPresent(p) && isOnline(p) && p.bot === null)
    .sort((a, b) => a.joinedAt - b.joinedAt);

  const successor = disponiveis.find((p) => !p.isSpectator) ?? disponiveis[0];
  if (!successor) return room; // ninguém a quem passar; sucede na próxima conexão
  if (successor.id === room.hostId) return room;

  emissions.push(all({ type: 'system:notice', payload: { code: 'NOVO_HOST', params: { hostId: successor.id } } }));
  return { ...room, hostId: successor.id };
}

/**
 * O host atual ainda serve?
 *
 * Serve se está na sala, online, não é espectador e não é bot. As quatro
 * condições, e não só as duas primeiras: um host que virou espectador ou um bot
 * que herdou a mesa estão tecnicamente presentes e não podem começar nada.
 */
export function hostServe(room: Room): boolean {
  const host = room.players.find((p) => p.id === room.hostId);
  return host !== undefined
    && isPresent(host)
    && isOnline(host)
    && !host.isSpectator
    && host.bot === null;
}

/** Garante um host utilizável, ou deixa como está se não houver a quem passar. */
export function garantirHost(room: Room, emissions: Emission[]): Room {
  if (hostServe(room)) return room;
  return passarHost(room, room.hostId, emissions);
}
