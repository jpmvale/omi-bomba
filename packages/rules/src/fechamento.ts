/**
 * A arena que fecha.
 *
 * Sem isto, dois jogadores cautelosos (ou dois bots) empatam por tempo em
 * quatro rodadas de cada cinco — foi o que a simulação mostrou na primeira
 * versão. Depois dos minutos combinados na sala (`options.fechamento`), um
 * bloco por vez cai do céu, começando no canto (1,1) e seguindo em espiral
 * pelas bordas até o centro. Quem estiver na casa morre; bomba e item ali somem.
 *
 * A ordem é fixa e conhecida por todos (é geometria, não sorteio), e por isso
 * o bot pode fugir dela do mesmo jeito que foge de bomba.
 */

import { ALTURA, LARGURA } from './constantes.js';
import { eParedeFixa, indice } from './mapa.js';

/** Casas internas em espiral horária, de fora para dentro, sem os pilares. */
export const ESPIRAL: readonly number[] = (() => {
  const ordem: number[] = [];
  let x0 = 1;
  let y0 = 1;
  let x1 = LARGURA - 2;
  let y1 = ALTURA - 2;
  while (x0 <= x1 && y0 <= y1) {
    for (let x = x0; x <= x1; x++) ordem.push(indice(x, y0));
    for (let y = y0 + 1; y <= y1; y++) ordem.push(indice(x1, y));
    if (y0 < y1) for (let x = x1 - 1; x >= x0; x--) ordem.push(indice(x, y1));
    if (x0 < x1) for (let y = y1 - 1; y > y0; y--) ordem.push(indice(x0, y));
    x0++;
    y0++;
    x1--;
    y1--;
  }
  return ordem.filter((i) => !eParedeFixa(i % LARGURA, Math.floor(i / LARGURA)));
})();
