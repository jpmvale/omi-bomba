/**
 * O que sai do servidor. No OmiBomba quase tudo está à vista de todos — a
 * exceção é o que está DENTRO das caixas. Mandar `ocultos` ao cliente seria
 * entregar a qualquer um com o console aberto o mapa dos itens.
 *
 * Por isso a projeção é uma lista de campos permitidos, e não um "tudo menos
 * `ocultos`": campo novo no estado não vaza sozinho.
 */

import type { Bomba, Chama, Evento, Fase, Item, JogadorNoJogo, MatchOptions, MatchState, PlayerId } from './types.js';

export type JogadorVisto = Omit<JogadorNoJogo, 'querBomba'>;

export interface MatchView {
  matchId: string;
  options: MatchOptions;
  playerOrder: PlayerId[];
  passo: number;
  rodada: number;
  fase: Fase;
  faseAtePasso: number;
  fechaNoPasso: number;
  /** A grade em texto, um dígito por célula. Ausente num quadro em que não mudou. */
  grade?: string;
  gradeVersao: number;
  jogadores: JogadorVisto[];
  bombas: Pick<Bomba, 'id' | 'x' | 'y' | 'dono' | 'alcance' | 'explodeNoPasso'>[];
  chamas: Chama[];
  itens: Pick<Item, 'x' | 'y' | 'tipo'>[];
  placar: Record<PlayerId, number>;
  vencedorDaRodada: PlayerId | null;
  endReason: MatchState['endReason'];
  campeao: PlayerId | null;
  eventos: Evento[];
}

export function project(m: MatchState, comGrade = true): MatchView {
  const view: MatchView = {
    matchId: m.id,
    options: m.options,
    playerOrder: m.playerOrder,
    passo: m.passo,
    rodada: m.rodada,
    fase: m.fase,
    faseAtePasso: m.faseAtePasso,
    fechaNoPasso: m.fechaNoPasso,
    gradeVersao: m.gradeVersao,
    jogadores: m.jogadores.map((j) => ({
      id: j.id,
      x: j.x,
      y: j.y,
      mov: j.mov,
      olhando: j.olhando,
      querDir: j.querDir,
      vivo: j.vivo,
      morreuNoPasso: j.morreuNoPasso,
      alcance: j.alcance,
      velocidade: j.velocidade,
    })),
    bombas: m.bombas.map((b) => ({ id: b.id, x: b.x, y: b.y, dono: b.dono, alcance: b.alcance, explodeNoPasso: b.explodeNoPasso })),
    chamas: m.chamas,
    // Item ainda coberto pelo fogo que o revelou não aparece: no desenho ele
    // surge quando o fogo apaga, que é quando dá para pegar.
    itens: m.itens.filter((i) => i.visivelNoPasso <= m.passo).map((i) => ({ x: i.x, y: i.y, tipo: i.tipo })),
    placar: m.placar,
    vencedorDaRodada: m.vencedorDaRodada,
    endReason: m.endReason,
    campeao: m.campeao,
    eventos: m.eventos,
  };
  if (comGrade) view.grade = m.grade.join('');
  return view;
}
