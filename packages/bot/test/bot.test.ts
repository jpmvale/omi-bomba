/**
 * O bot: foge do fogo, não se tranca com a própria bomba, não vê o que está
 * escondido, e o difícil ganha do fácil na maioria das vezes.
 */

import { describe, expect, it } from 'vitest';
import {
  aplicarEntrada,
  CAIXA,
  CHAO,
  DIRECOES,
  ESPIRAL,
  FECHAMENTO_OPCOES,
  OPOSTA,
  conferirInvariantes,
  createMatch,
  createRng,
  eParedeFixa,
  LARGURA,
  PAREDE,
  passo,
  type Dir,
  type MatchState,
} from '@omi-bomba/rules';
import { BOT_DIFFICULTIES, decidirEntrada, type BotDifficulty } from '../src/index.js';

function arena(lugares: Record<string, [number, number]>, ids = Object.keys(lugares)): MatchState {
  let m = createMatch({ matchId: 'm', seed: 'b', playerIds: ids, options: { vitorias: 1, fechamento: 1 } });
  while (m.fase === 'CONTAGEM') m = passo(m);
  const grade = m.grade.map((_, i) => (eParedeFixa(i % LARGURA, Math.floor(i / LARGURA)) ? PAREDE : CHAO));
  return {
    ...m,
    grade,
    ocultos: {},
    jogadores: m.jogadores.map((j) => (lugares[j.id] ? { ...j, x: lugares[j.id]![0], y: lugares[j.id]![1] } : j)),
  };
}

/** Joga `n` passos com `quem` decidindo pelo bot e os outros parados. */
function jogar(m: MatchState, quem: string, dif: BotDifficulty, n: number, seed = 'r'): MatchState {
  const rng = createRng(seed);
  let x = m;
  for (let i = 0; i < n && x.fase === 'JOGANDO'; i++) {
    x = aplicarEntrada(x, quem, decidirEntrada(x, quem, dif, rng));
    x = passo(x);
  }
  return x;
}

describe('bot', () => {
  it.each(['FACIL', 'MEDIO', 'DIFICIL'] as const)('%s sai do alcance de uma bomba que vai explodir', (dif) => {
    let m = arena({ a: [5, 1], b: [13, 11] });
    // Bomba de b ao lado do bot, pavio quase no fim.
    m = { ...m, bombas: [{ id: 99, x: 4, y: 1, dono: 'b', alcance: 3, colocadaNoPasso: m.passo, explodeNoPasso: m.passo + 20, deslize: null }] };
    // Só decide e anda; nada de bomba própria para não confundir o teste.
    const rng = createRng('fuga');
    for (let i = 0; i < 25; i++) {
      const e = decidirEntrada(m, 'a', dif, rng);
      m = aplicarEntrada(m, 'a', { dir: e.dir, bomba: false });
      m = passo(m);
    }
    expect(m.jogadores.find((j) => j.id === 'a')!.vivo).toBe(true);
  });

  it('não solta bomba num beco sem saída', () => {
    // a em (1,1) cercado por caixas: (2,1) e (1,2). Soltar ali é morrer.
    let m = arena({ a: [1, 1], b: [13, 11] });
    m = { ...m, grade: m.grade.map((c, i) => (i === 2 + LARGURA || i === 1 + 2 * LARGURA ? CAIXA : c)) };
    const rng = createRng('beco');
    for (let i = 0; i < 50; i++) expect(decidirEntrada(m, 'a', 'DIFICIL', rng).bomba).toBe(false);
  });

  it('quebra caixas e sobrevive à própria bomba', () => {
    let m = arena({ a: [1, 1], b: [13, 11] });
    m = { ...m, grade: m.grade.map((c, i) => (i === 5 + LARGURA ? CAIXA : c)) };
    m = jogar(m, 'a', 'MEDIO', 400);
    expect(m.grade[5 + LARGURA]).toBe(CHAO);
    expect(m.jogadores.find((j) => j.id === 'a')!.vivo).toBe(true);
  });

  it('a decisão não depende do que está escondido nas caixas', () => {
    const base = arena({ a: [1, 1], b: [13, 11] });
    const comCaixa = { ...base, grade: base.grade.map((c, i) => (i === 3 + LARGURA ? CAIXA : c)) };
    const semNada: MatchState = { ...comCaixa, ocultos: {} };
    const comItem: MatchState = { ...comCaixa, ocultos: { [3 + LARGURA]: 'FOGO' } };
    const x = decidirEntrada(semNada, 'a', 'DIFICIL', createRng('o'));
    const y = decidirEntrada(comItem, 'a', 'DIFICIL', createRng('o'));
    expect(y).toEqual(x);
  });

  it('o difícil ganha do fácil na maioria dos duelos', () => {
    let dificil = 0;
    let facil = 0;
    for (let s = 0; s < 16; s++) {
      let m = createMatch({ matchId: `d${s}`, seed: `duelo${s}`, playerIds: ['a', 'b'], options: { vitorias: 1, fechamento: 1 } });
      const rng = createRng(`r${s}`);
      // Lados alternados para o canto não decidir.
      const difDe = (id: string): BotDifficulty => ((id === 'a') === (s % 2 === 0) ? 'DIFICIL' : 'FACIL');
      for (let i = 0; i < 50_000 && m.endReason === null; i++) {
        for (const id of ['a', 'b']) m = aplicarEntrada(m, id, decidirEntrada(m, id, difDe(id), rng));
        m = passo(m);
      }
      if (m.campeao) (difDe(m.campeao) === 'DIFICIL' ? dificil++ : facil++);
    }
    expect(dificil).toBeGreaterThan(facil);
  }, 60_000);
});

describe('simulação', () => {
  it('rodadas inteiras respeitam os invariantes a cada passo e sempre terminam', () => {
    let rodadas = 0;
    let chutes = 0;
    let maldicoes = 0;
    for (let s = 0; s < 16; s++) {
      const n = 2 + (s % 4);
      const ids = Array.from({ length: n }, (_, i) => `p${i}`);
      const fechamento = FECHAMENTO_OPCOES[s % 3]!;
      let m = createMatch({ matchId: 'm', seed: `sim${s}`, playerIds: ids, options: { vitorias: 1, fechamento } });
      const rng = createRng(`bot${s}`);
      // Nas sementes ímpares, p0 joga como gente afobada (aperta qualquer coisa)
      // e todo mundo nasce com chute: é o que exercita bomba escorregando,
      // caveira passando e itens espalhados — bot não faz isso de propósito.
      const afobado = s % 2 === 1;
      let rodada = 0;
      let inicio = m.passo;
      while (m.endReason === null) {
        if (m.rodada !== rodada) {
          rodada = m.rodada;
          inicio = m.passo;
          if (afobado) m = { ...m, jogadores: m.jogadores.map((j) => ({ ...j, chute: true })) };
        }
        for (const [i, id] of ids.entries()) {
          const entrada = afobado && i === 0
            ? { dir: rng.nextInt(5) === 0 ? null : DIRECOES[rng.nextInt(4)]!, bomba: rng.nextInt(8) === 0 }
            : decidirEntrada(m, id, BOT_DIFFICULTIES[(i + s) % 3]!, rng);
          m = aplicarEntrada(m, id, entrada);
        }
        m = passo(m);
        for (const e of m.eventos) {
          if (e.tipo === 'CHUTE') chutes++;
          if (e.tipo === 'MALDICAO') maldicoes++;
        }
        const erros = conferirInvariantes(m);
        if (erros.length > 0) throw new Error(`semente ${s}, passo ${m.passo}: ${erros.join('; ')}`);
        // Uma rodada nunca passa do teto: contagem + minutos + a espiral inteira + o fim.
        expect(m.passo - inicio).toBeLessThan(60 + fechamento * 1200 + ESPIRAL.length * 8 + 200);
      }
      rodadas += m.rodada;
    }
    expect(rodadas).toBeGreaterThanOrEqual(16);
    // O teste só vale se os caminhos novos rodaram de verdade.
    expect(chutes).toBeGreaterThan(0);
    expect(maldicoes).toBeGreaterThan(0);
  }, 120_000);

  it('o bot difícil não fica tremendo no lugar (ida e volta a cada passo)', () => {
    let tremores = 0;
    for (let s = 0; s < 12; s++) {
      const ids = ['a', 'b', 'c', 'd'];
      let m = createMatch({ matchId: 'm', seed: `o${s}`, playerIds: ids, options: { vitorias: 1, fechamento: 1 } });
      const rng = createRng(`r${s}`);
      const historico: Record<string, (string | null)[]> = {};
      for (let t = 0; t < 6000 && m.endReason === null; t++) {
        for (const id of ids) {
          const e = decidirEntrada(m, id, 'DIFICIL', rng);
          (historico[id] ??= []).push(e.dir);
          m = aplicarEntrada(m, id, e);
        }
        m = passo(m);
        if (m.fase !== 'JOGANDO') { for (const id of ids) historico[id] = []; continue; }
        for (const id of ids) {
          const h = historico[id]!.slice(-20);
          let viradas = 0;
          for (let i = 1; i < h.length; i++) if (h[i] && h[i - 1] && h[i] === OPOSTA[h[i - 1] as Dir]) viradas++;
          if (viradas >= 12) { tremores++; historico[id] = []; }
        }
      }
    }
    expect(tremores).toBe(0);
  }, 120_000);
});
