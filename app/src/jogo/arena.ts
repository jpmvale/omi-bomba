/**
 * Os quadros da arena, fora do React.
 *
 * Chegam 20 por segundo; passar cada um por `setState` re-renderizaria a tela
 * inteira à toa. O desenho lê daqui direto, a cada quadro do navegador, e o
 * placar (que muda pouco) assina com `useArena`, que só avisa quando algo que
 * aparece no placar mudou.
 */

import { useSyncExternalStore } from 'react';
import type { MatchView } from '@omi-bomba/rules';

export interface Quadro {
  view: MatchView;
  /** A grade sempre presente: a do quadro, ou a última que chegou. */
  grade: string;
  chegouEm: number;
}

let atual: Quadro | null = null;
let anterior: Quadro | null = null;
const ouvintes = new Set<() => void>();
let assinatura = '';
/** O retrato que o placar vê: só troca quando o `resumo` muda, senão o React re-renderizaria a cada quadro. */
let doPlacar: MatchView | null = null;

/** O que, mudando, pede para o placar se redesenhar. */
function resumo(v: MatchView): string {
  // Vivo e poderes de cada um (o placar mostra), e quantos abates já houve.
  const vivos = v.jogadores
    .map((j) => `${j.vivo ? 1 : 0}${j.alcance}${j.bombas}${j.velocidade}${j.chute ? 1 : 0}${j.maldicao ? 1 : 0}`)
    .join(',') + `|${v.abates.length}`;
  const segundos = Math.ceil((v.faseAtePasso - v.passo) / 20);
  return `${v.matchId}|${v.rodada}|${v.fase}|${vivos}|${JSON.stringify(v.placar)}|${segundos}|${v.endReason ?? ''}`;
}

export function receberQuadro(view: MatchView, agora = performance.now()): void {
  const grade = view.grade ?? (atual && atual.view.matchId === view.matchId ? atual.grade : '');
  if (!grade) return; // sem grade nenhuma ainda: espera o retrato completo
  // Quadro velho (ou repetido) não volta o relógio.
  if (atual && atual.view.matchId === view.matchId && view.passo < atual.view.passo) return;
  anterior = atual;
  atual = { view, grade, chegouEm: agora };
  const r = resumo(view);
  if (r !== assinatura) {
    assinatura = r;
    doPlacar = view;
    for (const o of ouvintes) o();
  }
}

export function limparArena(): void {
  atual = null;
  anterior = null;
  assinatura = '';
  doPlacar = null;
  for (const o of ouvintes) o();
}

export const quadroAtual = (): Quadro | null => atual;
export const quadroAnterior = (): Quadro | null => anterior;

export function useArena(): MatchView | null {
  return useSyncExternalStore(
    (o) => { ouvintes.add(o); return () => ouvintes.delete(o); },
    () => doPlacar,
  );
}
