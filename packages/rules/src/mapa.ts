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

/**
 * A borda da arena, em sentido horário a partir do canto (0,0): é por onde o
 * fantasma anda. São as casas de parede em volta — fora da área de jogo.
 */
export const ANEL: readonly (readonly [number, number])[] = (() => {
  const casas: [number, number][] = [];
  for (let x = 0; x < LARGURA; x++) casas.push([x, 0]);
  for (let y = 1; y < ALTURA; y++) casas.push([LARGURA - 1, y]);
  for (let x = LARGURA - 2; x >= 0; x--) casas.push([x, ALTURA - 1]);
  for (let y = ALTURA - 2; y >= 1; y--) casas.push([0, y]);
  return casas;
})();

export const anelEm = (i: number): readonly [number, number] => ANEL[((i % ANEL.length) + ANEL.length) % ANEL.length]!;

/** A direção da tela que leva da casa `i` do anel à vizinha no `sentido` dado. */
export function dirNoAnel(i: number, sentido: 1 | -1): Dir {
  const [ax, ay] = anelEm(i);
  const [bx, by] = anelEm(i + sentido);
  if (bx > ax) return 'DIREITA';
  if (bx < ax) return 'ESQUERDA';
  return by > ay ? 'BAIXO' : 'CIMA';
}

/**
 * Que sentido do anel a tecla `d` pede na casa `i`: a tecla que aponta para a
 * vizinha. Na borda de cima e de baixo são ← e →; nas laterais, ↑ e ↓ — e
 * também ← (sobe) e → (desce), para dar para jogar só com ← e →; nos cantos,
 * as duas da quina.
 */
export function sentidoNoAnel(i: number, d: Dir): 1 | -1 | null {
  if (dirNoAnel(i, 1) === d) return 1;
  if (dirNoAnel(i, -1) === d) return -1;
  const [x, y] = anelEm(i);
  const lateral = (x === 0 || x === LARGURA - 1) && y > 0 && y < ALTURA - 1;
  if (lateral && d === 'ESQUERDA') return sentidoNoAnel(i, 'CIMA');
  if (lateral && d === 'DIREITA') return sentidoNoAnel(i, 'BAIXO');
  return null;
}

/** Para onde o fantasma nesta casa do anel arremessa: para dentro. Do canto não dá. */
export function paraDentro(i: number): Dir | null {
  const [x, y] = anelEm(i);
  const canto = (x === 0 || x === LARGURA - 1) && (y === 0 || y === ALTURA - 1);
  if (canto) return null;
  if (y === 0) return 'BAIXO';
  if (y === ALTURA - 1) return 'CIMA';
  return x === 0 ? 'DIREITA' : 'ESQUERDA';
}

/** A casa do anel mais perto de (x, y): onde o morto aparece. */
export function anelMaisPerto(x: number, y: number): number {
  let melhor = 0;
  let dist = Number.POSITIVE_INFINITY;
  ANEL.forEach(([ax, ay], i) => {
    const d = Math.abs(ax - x) + Math.abs(ay - y);
    if (d < dist && paraDentro(i) !== null) {
      dist = d;
      melhor = i;
    }
  });
  return melhor;
}
