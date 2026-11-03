/**
 * A previsão do próprio boneco contra uma rede de verdade, simulada: a
 * entrada leva `ida` passos para chegar ao servidor e o quadro leva `volta`
 * para chegar de volta. A referência é o mesmo jogo sem atraso nenhum — é o
 * que a pessoa sentiria jogando ao lado do servidor.
 *
 * A previsão tem de ficar colada na referência; desenhar o quadro do servidor,
 * como antes, fica uma casa inteira para trás. É a diferença entre o "lag" e
 * o boneco obedecer na hora.
 */

import { describe, expect, it } from 'vitest';
import {
  CHAO,
  DELTA,
  LARGURA,
  PAREDE,
  TICK_MS,
  UNIDADE,
  aplicarEntrada,
  createMatch,
  eParedeFixa,
  passo,
  project,
  type Dir,
  type MatchState,
  type MatchView,
} from '@omi-bomba/rules';
import { criarPrevisao } from '../src/jogo/previsao';

type Roteiro = Record<number, { dir: Dir | null; bomba?: boolean }>;

function arena(): MatchState {
  let m = createMatch({ matchId: 'm', seed: 'p', playerIds: ['eu', 'outro'], options: { vitorias: 3, fechamento: 5 } });
  while (m.fase === 'CONTAGEM') m = passo(m);
  const grade = m.grade.map((_, i) => (eParedeFixa(i % LARGURA, Math.floor(i / LARGURA)) ? PAREDE : CHAO));
  return {
    ...m,
    grade,
    ocultos: {},
    jogadores: m.jogadores.map((j) => (j.id === 'eu' ? { ...j, x: 3, y: 3 } : { ...j, x: 13, y: 11 })),
  };
}

function pos(m: MatchState | MatchView): [number, number] {
  const j = m.jogadores.find((x) => x.id === 'eu')!;
  if (!j.mov) return [j.x, j.y];
  const [dx, dy] = DELTA[j.mov.dir];
  return [j.x + (dx * j.mov.progresso) / UNIDADE, j.y + (dy * j.mov.progresso) / UNIDADE];
}

const distancia = (a: [number, number], b: [number, number]): number => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

/** Joga o roteiro com atraso e devolve o pior desvio da previsão e do quadro cru. */
function jogar(roteiro: Roteiro, atraso: (t: number) => [number, number], passos = 120) {
  const inicio = 1000;
  const prev = criarPrevisao('eu', inicio);
  let servidor = arena();
  let referencia = servidor;
  const aCaminho: { chega: number; dir: Dir | null; bomba: boolean; seq: number }[] = [];
  const quadros: { chega: number; view: MatchView }[] = [];
  let visto: MatchView | null = null;
  let piorPrevisao = 0;
  let piorCru = 0;
  let ultima: [number, number] | null = null;
  const grade = servidor.grade.join('');

  for (let t = 0; t < passos; t++) {
    // Começo do passo local t: chega o que tinha de chegar.
    for (const q of quadros.filter((x) => x.chega === t)) visto = q.view;
    const agora = inicio + t * TICK_MS + TICK_MS / 2;
    const e = roteiro[t];
    if (e) {
      const seq = prev.registrar(e.dir, e.bomba ?? false, agora);
      // O WebSocket entrega em ordem: atraso que oscila não troca a ordem.
      const chega = Math.max(t + atraso(t)[0], aCaminho.at(-1)?.chega ?? 0);
      aCaminho.push({ chega, dir: e.dir, bomba: e.bomba ?? false, seq });
      referencia = aplicarEntrada(referencia, 'eu', { dir: e.dir, bomba: e.bomba ?? false }, { guardarToque: true });
    }
    // O desenho deste instante (meio do passo t) contra a referência no mesmo instante.
    if (visto) {
      const p = prev.onde(visto, grade, agora);
      const ref0 = pos(referencia);
      const ref1 = pos(passo(referencia));
      const alvo: [number, number] = [(ref0[0] + ref1[0]) / 2, (ref0[1] + ref1[1]) / 2];
      if (p) piorPrevisao = Math.max(piorPrevisao, distancia([p.x, p.y], alvo));
      if (p) ultima = [p.x, p.y];
      piorCru = Math.max(piorCru, distancia(pos(visto), alvo));
    }
    // Fim do passo: a referência anda; o servidor recebe o que chegou e anda.
    referencia = passo(referencia);
    for (const x of aCaminho.filter((y) => y.chega === t)) {
      servidor = aplicarEntrada(servidor, 'eu', { dir: x.dir, bomba: x.bomba, seq: x.seq }, { guardarToque: true });
    }
    servidor = passo(servidor);
    quadros.push({ chega: Math.max(t + 1 + atraso(t)[1], quadros.at(-1)?.chega ?? 0), view: project(servidor) });
  }
  return { piorPrevisao, piorCru, servidor, referencia, ultima };
}

const roteiro: Roteiro = {
  5: { dir: 'DIREITA' },
  14: { dir: 'BAIXO' },
  22: { dir: null },
  30: { dir: 'ESQUERDA' },
  33: { dir: 'DIREITA' }, // meia-volta rápida
  34: { dir: null },
  45: { dir: 'CIMA' },
  46: { dir: 'DIREITA' }, // toque de curva, voltando à tecla anterior
  60: { dir: null, bomba: true },
  61: { dir: 'ESQUERDA' },
  63: { dir: 'DIREITA' }, // a bomba recém-solta barra a volta
  70: { dir: null },
};

describe('previsão do próprio boneco', () => {
  it('com 150 ms de ida e volta, fica colada no jogo sem atraso', () => {
    const r = jogar(roteiro, () => [2, 1]);
    expect(r.piorPrevisao).toBeLessThan(0.25);
    // O quadro cru, que era o que se desenhava, fica bem para trás.
    expect(r.piorCru).toBeGreaterThan(0.6);
    // E no fim os dois jogos chegam ao mesmo lugar.
    expect(pos(r.servidor)).toEqual(pos(r.referencia));
  });

  it('com a rede oscilando, termina onde o servidor diz', () => {
    // Atraso de 1 a 4 passos em cada sentido, variando. A oscilação muda o
    // jogo de verdade (duas teclas chegam no mesmo passo do servidor), então
    // a régua aqui é o servidor, não a referência: quem manda é ele.
    const r = jogar(roteiro, (t) => [1 + ((t * 7) % 4), 1 + ((t * 5) % 3)], 160);
    expect(r.ultima).not.toBeNull();
    expect(distancia(r.ultima!, pos(r.servidor))).toBeLessThan(0.01);
  });
});
