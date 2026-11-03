/**
 * A arena: parede na borda, pilares nas casas de coordenadas pares, caixas
 * sorteadas no resto — menos onde cada um nasce.
 */

import { ALTURA, CHANCE_DE_ITEM, DENSIDADE_DE_CAIXAS, LARGURA, PESO_DOS_ITENS } from './constantes.js';
import type { Rng } from './rng.js';
import { CAIXA, CHAO, PAREDE, type Celula, type Dir, type TipoItem } from './types.js';

export const indice = (x: number, y: number): number => y * LARGURA + x;
export const dentro = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < LARGURA && y < ALTURA;

export const DELTA: Record<Dir, readonly [number, number]> = {
  CIMA: [0, -1],
  BAIXO: [0, 1],
  ESQUERDA: [-1, 0],
  DIREITA: [1, 0],
};

export const OPOSTA: Record<Dir, Dir> = {
  CIMA: 'BAIXO',
  BAIXO: 'CIMA',
  ESQUERDA: 'DIREITA',
  DIREITA: 'ESQUERDA',
};

export function eParedeFixa(x: number, y: number): boolean {
  if (x === 0 || y === 0 || x === LARGURA - 1 || y === ALTURA - 1) return true;
  return x % 2 === 0 && y % 2 === 0;
}

/**
 * Onde cada um nasce, na ordem em que os lugares são ocupados: primeiro cantos
 * opostos (dois jogadores ficam o mais longe possível), depois os outros dois
 * cantos, e o quinto no meio. O meio cai num corredor vertical — os vizinhos
 * da esquerda e da direita são pilares —, o que dá ao quinto a mesma saída em
 * L dos cantos, só que girada.
 */
export const NASCEDOUROS: readonly (readonly [number, number])[] = [
  [1, 1],
  [LARGURA - 2, ALTURA - 2],
  [LARGURA - 2, 1],
  [1, ALTURA - 2],
  [(LARGURA - 1) / 2, (ALTURA - 1) / 2],
];

/** O nascedouro e as casas vizinhas livres: sem caixa, para ninguém nascer preso. */
export function zonaSegura(): Set<number> {
  const seguras = new Set<number>();
  for (const [x, y] of NASCEDOUROS) {
    seguras.add(indice(x, y));
    for (const [dx, dy] of Object.values(DELTA)) {
      const nx = x + dx;
      const ny = y + dy;
      if (dentro(nx, ny) && !eParedeFixa(nx, ny)) seguras.add(indice(nx, ny));
    }
  }
  return seguras;
}

export interface ArenaGerada {
  grade: Celula[];
  ocultos: Record<number, TipoItem>;
}

export function gerarArena(rng: Rng): ArenaGerada {
  const grade: Celula[] = [];
  const seguras = zonaSegura();
  const ocultos: Record<number, TipoItem> = {};
  const escala = 10_000;

  for (let y = 0; y < ALTURA; y++) {
    for (let x = 0; x < LARGURA; x++) {
      if (eParedeFixa(x, y)) {
        grade.push(PAREDE);
        continue;
      }
      const i = indice(x, y);
      if (seguras.has(i) || rng.nextInt(escala) >= DENSIDADE_DE_CAIXAS * escala) {
        grade.push(CHAO);
        continue;
      }
      grade.push(CAIXA);
      if (rng.nextInt(escala) < CHANCE_DE_ITEM * escala) {
        ocultos[i] = sortearItem(rng);
      }
    }
  }
  return { grade, ocultos };
}

const TOTAL_DOS_PESOS = Object.values(PESO_DOS_ITENS).reduce((a, b) => a + b, 0);

/** Um item pelo peso de cada um (`PESO_DOS_ITENS`). */
export function sortearItem(rng: Rng): TipoItem {
  let n = rng.nextInt(TOTAL_DOS_PESOS);
  for (const [tipo, peso] of Object.entries(PESO_DOS_ITENS) as [TipoItem, number][]) {
    if (n < peso) return tipo;
    n -= peso;
  }
  return 'FOGO';
}
