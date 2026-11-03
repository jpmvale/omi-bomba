/**
 * Sala gravada por uma versão anterior do servidor.
 *
 * O deploy recria o processo, e as salas vivas voltam do Redis no formato em
 * que foram gravadas. Campo que a versão nova espera e a velha não tinha
 * ganha o valor de quem acabou de entrar na partida — sem isto, a primeira
 * rodada depois do deploy quebraria no meio (`abates` indefinido etc.).
 */

import {
  BOMBAS_INICIAIS,
  DEFAULT_OPTIONS,
  type Bomba,
  type Chama,
  type JogadorNoJogo,
  type MatchState,
} from '@omi-bomba/rules';
import type { Room } from './types.js';

export function migrarSala(sala: Room): Room {
  const options = { ...DEFAULT_OPTIONS, ...sala.options };
  if (!sala.match) return { ...sala, options };
  const m = sala.match as MatchState;
  const match: MatchState = {
    ...m,
    options: { ...DEFAULT_OPTIONS, ...m.options },
    abates: m.abates ?? [],
    jogadores: m.jogadores.map((j): JogadorNoJogo => ({
      ...j,
      bombas: j.bombas ?? BOMBAS_INICIAIS,
      chute: j.chute ?? false,
      maldicao: j.maldicao ?? null,
      imuneAte: j.imuneAte ?? 0,
    })),
    bombas: m.bombas.map((b): Bomba => ({ ...b, deslize: b.deslize ?? null })),
    chamas: m.chamas.map((c): Chama => ({ ...c, donos: c.donos ?? [] })),
  };
  return { ...sala, options, match };
}
