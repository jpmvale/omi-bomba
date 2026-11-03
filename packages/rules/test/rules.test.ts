/**
 * O motor: arena, movimento, bomba, fogo, itens, morte, rodada e partida. As
 * rodadas inteiras jogadas por bots, conferindo os invariantes, ficam nos
 * testes do bot (o motor não depende do bot).
 */

import { describe, expect, it } from 'vitest';
import {
  ALCANCE_INICIAL,
  ALTURA,
  CAIXA,
  CHAO,
  CONTAGEM_PASSOS,
  ESPIRAL,
  FECHAMENTO_APOS_PASSOS,
  FOGO_PASSOS,
  LARGURA,
  NASCEDOUROS,
  PAREDE,
  PAVIO_PASSOS,
  aplicarEntrada,
  createMatch,
  endMatch,
  eParedeFixa,
  indice,
  passo,
  project,
  zonaSegura,
  type MatchState,
} from '@omi-bomba/rules';

const nova = (n = 2, seed = 's', vitorias = 3): MatchState =>
  createMatch({ matchId: 'm', seed, playerIds: Array.from({ length: n }, (_, i) => `p${i}`), options: { vitorias } });

/** Pula a contagem. */
function jogando(m: MatchState): MatchState {
  let x = m;
  while (x.fase === 'CONTAGEM') x = passo(x);
  return x;
}

/** Arena vazia (só borda e pilares), com os jogadores onde o teste quiser. */
function limpa(m: MatchState, lugares: Record<string, [number, number]>): MatchState {
  const grade = m.grade.map((_, i) => (eParedeFixa(i % LARGURA, Math.floor(i / LARGURA)) ? PAREDE : CHAO));
  return {
    ...m,
    grade,
    ocultos: {},
    jogadores: m.jogadores.map((j) => (lugares[j.id] ? { ...j, x: lugares[j.id]![0], y: lugares[j.id]![1] } : j)),
  };
}

function passos(m: MatchState, n: number): MatchState {
  let x = m;
  for (let i = 0; i < n; i++) x = passo(x);
  return x;
}

describe('arena', () => {
  it('tem borda e pilares fixos, e ninguém nasce preso', () => {
    const m = nova(5);
    for (let y = 0; y < ALTURA; y++) {
      for (let x = 0; x < LARGURA; x++) {
        if (eParedeFixa(x, y)) expect(m.grade[indice(x, y)]).toBe(PAREDE);
      }
    }
    for (const i of zonaSegura()) expect(m.grade[i]).toBe(CHAO);
    for (const [x, y] of NASCEDOUROS) {
      const livres = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => m.grade[indice(x + dx!, y + dy!)] === CHAO);
      expect(livres.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('a mesma semente dá a mesma arena; rodadas diferentes, arenas diferentes', () => {
    expect(nova(2, 'a').grade).toEqual(nova(2, 'a').grade);
    expect(nova(2, 'a').grade).not.toEqual(nova(2, 'b').grade);
  });

  it('cada um nasce num nascedouro diferente', () => {
    const m = nova(5);
    const lugares = new Set(m.jogadores.map((j) => `${j.x},${j.y}`));
    expect(lugares.size).toBe(5);
  });

  it('a espiral passa por toda casa interna que não é pilar, uma vez cada', () => {
    expect(new Set(ESPIRAL).size).toBe(ESPIRAL.length);
    expect(ESPIRAL.length).toBe((LARGURA - 2) * (ALTURA - 2) - ((LARGURA - 3) / 2) * ((ALTURA - 3) / 2));
  });

  it('a projeção nunca leva os itens escondidos', () => {
    const v = project(nova(3));
    expect(JSON.stringify(v)).not.toContain('ocultos');
    expect(v.grade).toHaveLength(LARGURA * ALTURA);
  });
});

describe('movimento', () => {
  it('ninguém anda na contagem', () => {
    let m = aplicarEntrada(nova(), 'p0', { dir: 'DIREITA', bomba: false });
    m = passos(m, CONTAGEM_PASSOS - 1);
    expect(m.fase).toBe('CONTAGEM');
    expect(m.jogadores[0]!.mov).toBeNull();
  });

  it('anda casa a casa, para ao soltar no centro da casa seguinte', () => {
    let m = limpa(jogando(nova()), { p0: [1, 1], p1: [13, 11] });
    m = aplicarEntrada(m, 'p0', { dir: 'DIREITA', bomba: false });
    m = passo(m);
    expect(m.jogadores[0]!.mov?.dir).toBe('DIREITA');
    m = aplicarEntrada(m, 'p0', { dir: null, bomba: false });
    m = passos(m, 10);
    expect(m.jogadores[0]).toMatchObject({ x: 2, y: 1, mov: null });
  });

  it('não atravessa pilar nem caixa', () => {
    let m = limpa(jogando(nova()), { p0: [1, 1], p1: [13, 11] });
    m = { ...m, grade: m.grade.map((c, i) => (i === indice(2, 1) ? CAIXA : c)) };
    m = aplicarEntrada(m, 'p0', { dir: 'DIREITA', bomba: false });
    m = passos(m, 10);
    expect(m.jogadores[0]).toMatchObject({ x: 1, y: 1, mov: null });
  });

  it('inverte no meio do caminho na hora', () => {
    let m = limpa(jogando(nova()), { p0: [1, 1], p1: [13, 11] });
    m = aplicarEntrada(m, 'p0', { dir: 'DIREITA', bomba: false });
    m = passo(m);
    m = aplicarEntrada(m, 'p0', { dir: 'ESQUERDA', bomba: false });
    m = passo(m);
    // Voltou para o lado da casa 1.
    const j = m.jogadores[0]!;
    expect(j.mov === null ? j.x : j.x + (j.mov.dir === 'ESQUERDA' ? -1 : 1) * (j.mov.progresso / 1000)).toBeLessThan(1.5);
  });

  it('velocidade a mais anda mais por passo', () => {
    let m = limpa(jogando(nova()), { p0: [1, 1], p1: [1, 3] });
    m = { ...m, jogadores: m.jogadores.map((j) => (j.id === 'p1' ? { ...j, velocidade: 4 } : j)) };
    m = aplicarEntrada(m, 'p0', { dir: 'DIREITA', bomba: false });
    m = aplicarEntrada(m, 'p1', { dir: 'DIREITA', bomba: false });
    m = passos(m, 20);
    expect(m.jogadores[1]!.x).toBeGreaterThan(m.jogadores[0]!.x);
  });
});

describe('bomba e fogo', () => {
  it('explode no pavio numa cruz do alcance, para na parede e quebra a primeira caixa', () => {
    let m = limpa(jogando(nova()), { p0: [3, 1], p1: [13, 11] });
    m = { ...m, grade: m.grade.map((c, i) => (i === indice(5, 1) || i === indice(6, 1) ? CAIXA : c)) };
    m = aplicarEntrada(m, 'p0', { dir: null, bomba: true });
    m = passo(m);
    expect(m.bombas).toHaveLength(1);
    // Sai do caminho: (3,1) → (3,3) é coluna livre (x ímpar).
    m = aplicarEntrada(m, 'p0', { dir: 'BAIXO', bomba: false });
    m = passos(m, 12);
    m = aplicarEntrada(m, 'p0', { dir: 'ESQUERDA', bomba: false });
    m = passos(m, PAVIO_PASSOS - 12);
    const fogo = new Set(m.chamas.map((c) => `${c.x},${c.y}`));
    expect(m.bombas).toHaveLength(0);
    expect(fogo.has('3,1')).toBe(true);
    expect(fogo.has('5,1')).toBe(true); // a caixa, a 2 casas
    expect(fogo.has('6,1')).toBe(false); // atrás da caixa
    expect(fogo.has('3,2')).toBe(true); // coluna ímpar: o fogo desce
    expect(fogo.has('2,1') && fogo.has('1,1')).toBe(true); // e vai até a borda da esquerda
    expect(m.grade[indice(5, 1)]).toBe(CHAO);
    expect(m.grade[indice(6, 1)]).toBe(CAIXA);
    expect(fogo.has('3,0')).toBe(false); // borda
  });

  it('uma bomba por vez', () => {
    let m = limpa(jogando(nova()), { p0: [1, 1], p1: [13, 11] });
    m = aplicarEntrada(m, 'p0', { dir: 'DIREITA', bomba: true });
    m = passos(m, 8);
    m = aplicarEntrada(m, 'p0', { dir: 'DIREITA', bomba: true });
    m = passo(m);
    expect(m.bombas).toHaveLength(1);
  });

  it('quem fica no fogo morre, e a rodada acaba com o outro vencendo', () => {
    let m = limpa(jogando(nova()), { p0: [1, 1], p1: [13, 11] });
    m = aplicarEntrada(m, 'p0', { dir: null, bomba: true });
    m = passos(m, PAVIO_PASSOS + 1);
    expect(m.jogadores[0]!.vivo).toBe(false);
    expect(m.fase).toBe('FIM_DA_RODADA');
    expect(m.vencedorDaRodada).toBe('p1');
    expect(m.placar.p1).toBe(1);
  });

  it('explosão em cadeia: fogo que encosta noutra bomba a detona no mesmo passo', () => {
    let m = limpa(jogando(nova(3)), { p0: [1, 1], p1: [3, 1], p2: [13, 11] });
    m = aplicarEntrada(m, 'p0', { dir: null, bomba: true });
    m = passos(m, 20);
    m = aplicarEntrada(m, 'p1', { dir: null, bomba: true });
    m = passo(m);
    expect(m.bombas).toHaveLength(2);
    m = passos(m, PAVIO_PASSOS - 21);
    expect(m.bombas).toHaveLength(2); // falta um passo para a primeira
    m = passo(m);
    expect(m.bombas).toHaveLength(0); // e a segunda, com 21 passos de pavio sobrando, vai junto
  });

  it('empate quando os dois últimos morrem no mesmo passo', () => {
    let m = limpa(jogando(nova()), { p0: [1, 1], p1: [3, 1] });
    m = aplicarEntrada(m, 'p0', { dir: null, bomba: true });
    m = passos(m, PAVIO_PASSOS + 1);
    expect(m.fase).toBe('FIM_DA_RODADA');
    expect(m.vencedorDaRodada).toBeNull();
  });

  it('item revelado sobrevive ao fogo que abriu a caixa e pode ser pego depois', () => {
    let m = limpa(jogando(nova()), { p0: [1, 3], p1: [13, 11] });
    const alvo = indice(1, 5);
    m = { ...m, grade: m.grade.map((c, i) => (i === alvo ? CAIXA : c)), ocultos: { [alvo]: 'FOGO' } };
    m = aplicarEntrada(m, 'p0', { dir: null, bomba: true });
    m = passo(m);
    m = aplicarEntrada(m, 'p0', { dir: 'CIMA', bomba: false });
    m = passos(m, 12);
    m = aplicarEntrada(m, 'p0', { dir: 'DIREITA', bomba: false });
    m = passos(m, 8);
    m = aplicarEntrada(m, 'p0', { dir: null, bomba: false });
    m = passos(m, PAVIO_PASSOS - 20);
    expect(m.bombas).toHaveLength(0);
    expect(m.jogadores[0]!.vivo).toBe(true);
    expect(m.itens).toHaveLength(1);
    expect(project(m).itens).toHaveLength(0); // ainda debaixo do fogo
    m = passos(m, FOGO_PASSOS + 1);
    expect(project(m).itens).toEqual([{ x: 1, y: 5, tipo: 'FOGO' }]);
    // Vai buscar: (3,1) → (1,1) → (1,5)
    m = aplicarEntrada(m, 'p0', { dir: 'ESQUERDA', bomba: false });
    m = passos(m, 12);
    m = aplicarEntrada(m, 'p0', { dir: 'BAIXO', bomba: false });
    m = passos(m, 30);
    expect(m.jogadores[0]!.alcance).toBe(ALCANCE_INICIAL + 1);
    expect(m.itens).toHaveLength(0);
  });
});

describe('rodada e partida', () => {
  it('a arena fecha em espiral depois de 90 s e esmaga quem estiver na casa', () => {
    let m = limpa(jogando(nova()), { p0: [1, 1], p1: [7, 5] });
    m = passos(m, FECHAMENTO_APOS_PASSOS);
    expect(m.fechadas).toBeGreaterThan(0);
    expect(m.grade[ESPIRAL[0]!]).toBe(PAREDE);
    expect(m.jogadores[0]!.vivo).toBe(false);
    expect(m.vencedorDaRodada).toBe('p1');
  });

  it('a partida acaba quando alguém chega às vitórias combinadas', () => {
    let m = nova(2, 'x', 1);
    m = limpa(jogando(m), { p0: [1, 1], p1: [13, 11] });
    m = aplicarEntrada(m, 'p0', { dir: null, bomba: true });
    m = passos(m, PAVIO_PASSOS + 1);
    expect(m.fase).toBe('FIM_DA_RODADA');
    m = passos(m, 200);
    expect(m.endReason).toBe('VITORIA');
    expect(m.campeao).toBe('p1');
  });

  it('com vitórias a mais, começa outra rodada numa arena nova', () => {
    let m = limpa(jogando(nova(2, 'x', 2)), { p0: [1, 1], p1: [13, 11] });
    m = aplicarEntrada(m, 'p0', { dir: null, bomba: true });
    m = passos(m, PAVIO_PASSOS + 1 + 80);
    expect(m.rodada).toBe(2);
    expect(m.fase).toBe('CONTAGEM');
    expect(m.jogadores.every((j) => j.vivo)).toBe(true);
  });

  it('o anfitrião encerra: leva quem lidera sozinho', () => {
    const m = { ...nova(3), placar: { p0: 2, p1: 1, p2: 0 } };
    expect(endMatch(m, 'ENCERRADA_PELO_HOST').campeao).toBe('p0');
    expect(endMatch({ ...m, placar: { p0: 1, p1: 1, p2: 0 } }, 'ENCERRADA_PELO_HOST').campeao).toBeNull();
  });
});
