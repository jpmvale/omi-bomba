/**
 * O motor: arena, movimento, bomba, fogo, itens, morte, rodada e partida. As
 * rodadas inteiras jogadas por bots, conferindo os invariantes, ficam nos
 * testes do bot (o motor não depende do bot).
 */

import { describe, expect, it } from 'vitest';
import {
  ALCANCE_INICIAL,
  BOMBAS_INICIAIS,
  FECHAMENTO_INTERVALO_PASSOS,
  MALDICAO_PASSOS,
  type Maldicao,
  ALTURA,
  CAIXA,
  CHAO,
  CONTAGEM_PASSOS,
  ESPIRAL,
  fechamentoEmPassos,
  FOGO_PASSOS,
  LARGURA,
  NASCEDOUROS,
  PAREDE,
  PAVIO_PASSOS,
  ANEL,
  ARREMESSO_CASAS,
  FANTASMA_APOS_PASSOS,
  PROTECAO_AO_VOLTAR,
  anelEm,
  aplicarEntrada,
  createMatch,
  endMatch,
  eParedeFixa,
  indice,
  passo,
  project,
  zonaSegura,
  type JogadorNoJogo,
  type MatchState,
  type TipoItem,
  conferirInvariantes,
} from '@omi-bomba/rules';

const nova = (n = 2, seed = 's', vitorias = 3): MatchState =>
  createMatch({ matchId: 'm', seed, playerIds: Array.from({ length: n }, (_, i) => `p${i}`), options: { vitorias, fechamento: 1 } });

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
  it('a arena fecha em espiral depois do tempo combinado e esmaga quem estiver na casa', () => {
    let m = limpa(jogando(nova()), { p0: [1, 1], p1: [7, 5] });
    m = passos(m, fechamentoEmPassos(1));
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

/** Muda um jogador direto no estado (atalho de teste, não regra). */
function comJogador(m: MatchState, id: string, mudar: Partial<JogadorNoJogo>): MatchState {
  return { ...m, jogadores: m.jogadores.map((j) => (j.id === id ? { ...j, ...mudar } : j)) };
}

const comItem = (m: MatchState, x: number, y: number, tipo: TipoItem): MatchState =>
  ({ ...m, itens: [...m.itens, { x, y, tipo, visivelNoPasso: 0 }] });

const jog = (m: MatchState, id: string): JogadorNoJogo => m.jogadores.find((j) => j.id === id)!;

describe('fechamento configurável', () => {
  it.each([1, 3, 5])('com %i min, o primeiro bloco cai no canto (1,1) na hora certa', (min) => {
    let m = jogando(nova(2, 's', 3));
    m = { ...m, options: { ...m.options, fechamento: min } };
    const base = createMatch({ matchId: 'm', seed: 's', playerIds: ['p0', 'p1'], options: { vitorias: 3, fechamento: min } });
    expect(base.fechaNoPasso).toBe(CONTAGEM_PASSOS + fechamentoEmPassos(min));
    let x = limpa(jogando(base), { p0: [7, 5], p1: [7, 7] });
    x = passos(x, base.fechaNoPasso - x.passo - 1);
    expect(x.fechadas).toBe(0);
    x = passo(x);
    expect(x.fechadas).toBe(1);
    expect(ESPIRAL[0]).toBe(indice(1, 1));
    expect(x.grade[indice(1, 1)]).toBe(PAREDE);
    expect(x.eventos).toContainEqual({ tipo: 'FECHOU', x: 1, y: 1 });
  });

  it('a rodada termina, no máximo, quando a espiral fecha inteira', () => {
    // Os dois na última casa da espiral: sobrevivem até o último bloco, que pega os dois.
    const ultima = ESPIRAL[ESPIRAL.length - 1]!;
    const lugar: [number, number] = [ultima % LARGURA, Math.floor(ultima / LARGURA)];
    let m = limpa(jogando(nova()), { p0: lugar, p1: lugar });
    const fecha = m.fechaNoPasso;
    while (m.fase === 'JOGANDO') m = passo(m);
    expect(m.passo).toBe(fecha + (ESPIRAL.length - 1) * FECHAMENTO_INTERVALO_PASSOS);
    expect(m.vencedorDaRodada).toBeNull();
    expect(m.abates.filter((a) => a.causa === 'FECHAMENTO')).toHaveLength(2);
  });
});

describe('itens novos', () => {
  it('bomba: cada item soma uma bomba armada ao mesmo tempo', () => {
    let m = limpa(jogando(nova()), { p0: [1, 1], p1: [13, 11] });
    m = comItem(m, 2, 1, 'BOMBA');
    m = aplicarEntrada(m, 'p0', { dir: 'DIREITA', bomba: false });
    m = passos(m, 6);
    expect(jog(m, 'p0').bombas).toBe(BOMBAS_INICIAIS + 1);
    m = aplicarEntrada(m, 'p0', { dir: 'DIREITA', bomba: true });
    m = passos(m, 5);
    m = aplicarEntrada(m, 'p0', { dir: 'DIREITA', bomba: true });
    m = passo(m);
    expect(m.bombas.filter((b) => b.dono === 'p0')).toHaveLength(2);
  });

  it('chute: andar contra a bomba a faz escorregar até o obstáculo', () => {
    let m = limpa(jogando(nova()), { p0: [1, 1], p1: [13, 11] });
    m = comJogador(m, 'p0', { chute: true });
    m = { ...m, grade: m.grade.map((c, i) => (i === indice(9, 1) ? CAIXA : c)) };
    m = { ...m, bombas: [{ id: 50, x: 2, y: 1, dono: 'p1', alcance: 1, colocadaNoPasso: m.passo, explodeNoPasso: m.passo + 200, deslize: null, carregadaPor: null, voo: null }] };
    m = aplicarEntrada(m, 'p0', { dir: 'DIREITA', bomba: false });
    m = passo(m);
    expect(m.eventos).toContainEqual({ tipo: 'CHUTE', playerId: 'p0' });
    m = aplicarEntrada(m, 'p0', { dir: null, bomba: false });
    m = passos(m, 40);
    const b = m.bombas[0]!;
    expect([b.x, b.y]).toEqual([8, 1]); // parou antes da caixa em (9,1)
    expect(b.deslize).toBeNull();
    expect(conferirInvariantes(m)).toEqual([]);
  });

  it('sem chute, a bomba barra o caminho', () => {
    let m = limpa(jogando(nova()), { p0: [1, 1], p1: [13, 11] });
    m = { ...m, bombas: [{ id: 50, x: 2, y: 1, dono: 'p1', alcance: 1, colocadaNoPasso: m.passo, explodeNoPasso: m.passo + 200, deslize: null, carregadaPor: null, voo: null }] };
    m = aplicarEntrada(m, 'p0', { dir: 'DIREITA', bomba: false });
    m = passos(m, 10);
    expect(m.bombas[0]!.x).toBe(2);
    expect(jog(m, 'p0').x).toBe(1);
  });

  const maldito = (tipo: Maldicao, m: MatchState): MatchState =>
    comJogador(m, 'p0', { maldicao: { tipo, atePasso: m.passo + MALDICAO_PASSOS } });

  it('caveira INVERTIDO: o direcional anda ao contrário', () => {
    let m = maldito('INVERTIDO', limpa(jogando(nova()), { p0: [3, 1], p1: [13, 11] }));
    m = aplicarEntrada(m, 'p0', { dir: 'DIREITA', bomba: false });
    m = passos(m, 5);
    expect(jog(m, 'p0').x).toBe(2);
  });

  it('caveira SEM_BOMBA: não solta bomba', () => {
    let m = maldito('SEM_BOMBA', limpa(jogando(nova()), { p0: [1, 1], p1: [13, 11] }));
    m = aplicarEntrada(m, 'p0', { dir: null, bomba: true });
    m = passo(m);
    expect(m.bombas).toHaveLength(0);
  });

  it('caveira LENTO: anda menos que o normal, e passa quando o tempo acaba', () => {
    let m = limpa(jogando(nova()), { p0: [1, 1], p1: [1, 3] });
    m = maldito('LENTO', m);
    m = aplicarEntrada(m, 'p0', { dir: 'DIREITA', bomba: false });
    m = aplicarEntrada(m, 'p1', { dir: 'DIREITA', bomba: false });
    m = passos(m, 10);
    expect(jog(m, 'p0').x).toBeLessThan(jog(m, 'p1').x);
    m = passos(m, MALDICAO_PASSOS);
    expect(jog(m, 'p0').maldicao).toBeNull();
  });

  it('pegar a caveira sorteia uma maldição, e ela passa para quem cruzar', () => {
    let m = limpa(jogando(nova(3)), { p0: [1, 1], p1: [3, 1], p2: [13, 11] });
    m = comItem(m, 2, 1, 'CAVEIRA');
    m = aplicarEntrada(m, 'p0', { dir: 'DIREITA', bomba: false });
    m = passos(m, 3);
    const tipo = jog(m, 'p0').maldicao?.tipo;
    expect(tipo).toBeDefined();
    // p0 segue para a direita, p1 está parado em (3,1): cruzam e a caveira passa.
    m = passos(m, 10);
    expect(jog(m, 'p1').maldicao?.tipo).toBe(tipo);
    expect(jog(m, 'p0').maldicao).toBeNull();
    // E não volta enquanto os dois estão juntos.
    m = passos(m, 5);
    expect(jog(m, 'p0').maldicao).toBeNull();
  });
});

describe('morte e registro', () => {
  it('quem morre espalha os itens que tinha por casas livres', () => {
    let m = limpa(jogando(nova(3)), { p0: [1, 1], p1: [13, 11], p2: [13, 1] });
    m = comJogador(m, 'p0', { alcance: ALCANCE_INICIAL + 2, velocidade: 1, bombas: 3, chute: true });
    m = aplicarEntrada(m, 'p0', { dir: null, bomba: true });
    m = passos(m, PAVIO_PASSOS + 1);
    expect(jog(m, 'p0').vivo).toBe(false);
    const tipos = m.itens.map((i) => i.tipo).sort();
    expect(tipos).toEqual(['BOMBA', 'BOMBA', 'CHUTE', 'FOGO', 'FOGO', 'VELOCIDADE']);
    for (const it of m.itens) {
      expect(m.grade[indice(it.x, it.y)]).toBe(CHAO);
      expect(m.chamas.some((c) => c.x === it.x && c.y === it.y)).toBe(false);
    }
    expect(conferirInvariantes(m)).toEqual([]);
  });

  it('o abate vai para o dono do fogo; a própria bomba é suicídio', () => {
    let m = limpa(jogando(nova(3)), { p0: [1, 1], p1: [3, 1], p2: [13, 11] });
    m = aplicarEntrada(m, 'p0', { dir: null, bomba: true });
    m = passos(m, PAVIO_PASSOS + 1);
    const a = m.abates;
    expect(a).toContainEqual(expect.objectContaining({ vitima: 'p1', autor: 'p0', causa: 'FOGO' }));
    expect(a).toContainEqual(expect.objectContaining({ vitima: 'p0', autor: 'p0', causa: 'FOGO' }));
    expect(m.eventos).toContainEqual({ tipo: 'MORTE', playerId: 'p1', autor: 'p0' });
  });

  it('dois fogos na mesma casa: um leva o abate, o outro a assistência', () => {
    let m = limpa(jogando(nova(3)), { p0: [1, 3], p1: [5, 3], p2: [3, 3] });
    // Nada de andar: p0 e p1 armam ao mesmo tempo, p2 fica no meio.
    m = aplicarEntrada(m, 'p0', { dir: null, bomba: true });
    m = aplicarEntrada(m, 'p1', { dir: null, bomba: true });
    m = passos(m, PAVIO_PASSOS + 1);
    const morte = m.abates.find((a) => a.vitima === 'p2')!;
    expect(['p0', 'p1']).toContain(morte.autor);
    expect(morte.ajudantes).toEqual([morte.autor === 'p0' ? 'p1' : 'p0']);
  });

  it('a projeção leva só os abates da rodada enquanto se joga, e todos no fim', () => {
    let m = limpa(jogando(nova(2, 'x', 2)), { p0: [1, 1], p1: [13, 11] });
    m = aplicarEntrada(m, 'p0', { dir: null, bomba: true });
    m = passos(m, PAVIO_PASSOS + 1 + 80 + 60);
    expect(m.rodada).toBe(2);
    expect(m.abates).toHaveLength(1);
    expect(project(m).abates).toHaveLength(0);
    expect(project({ ...m, fase: 'FIM_DA_RODADA' }).abates).toHaveLength(1);
  });
});

describe('movimento responsivo', () => {
  const humano = { guardarToque: true };

  it('toque rápido de volta, apertado e solto entre dois passos, ainda inverte', () => {
    const base = limpa(jogando(nova()), { p0: [3, 1], p1: [13, 11] });
    let m = aplicarEntrada(base, 'p0', { dir: 'DIREITA', bomba: false }, humano);
    m = passo(m);
    m = aplicarEntrada(m, 'p0', { dir: null, bomba: false }, humano);
    const toque = aplicarEntrada(aplicarEntrada(m, 'p0', { dir: 'ESQUERDA', bomba: false }, humano), 'p0', { dir: null, bomba: false }, humano);
    // Voltou de 1/5 do caminho: já está de novo no centro de (3,1).
    expect(passo(toque).jogadores[0]).toMatchObject({ x: 3, y: 1, mov: null });
    // O bot (sem toque guardado) não anda o que não decidiu.
    const bot = aplicarEntrada(aplicarEntrada(m, 'p0', { dir: 'ESQUERDA', bomba: false }), 'p0', { dir: null, bomba: false });
    expect(passo(bot).jogadores[0]!.mov?.dir).toBe('DIREITA');
  });

  it('a curva pedida um pouco antes da esquina é feita nela, mesmo voltando à tecla de antes', () => {
    let m = limpa(jogando(nova()), { p0: [2, 1], p1: [13, 11] });
    m = aplicarEntrada(m, 'p0', { dir: 'DIREITA', bomba: false }, humano);
    m = passos(m, 2);
    // Toca ↓ e volta para → antes de chegar em (3,1).
    m = aplicarEntrada(m, 'p0', { dir: 'BAIXO', bomba: false }, humano);
    m = aplicarEntrada(m, 'p0', { dir: 'DIREITA', bomba: false }, humano);
    m = passos(m, 4);
    const j = m.jogadores[0]!;
    expect(j.x).toBe(3);
    expect(j.mov?.dir).toBe('BAIXO');
  });

  it('o toque vence: vencido o prazo, não vira curva nenhuma', () => {
    let m = limpa(jogando(nova()), { p0: [1, 1], p1: [13, 11] });
    m = aplicarEntrada(m, 'p0', { dir: 'BAIXO', bomba: false }, humano);
    m = aplicarEntrada(m, 'p0', { dir: null, bomba: false }, humano);
    m = passos(m, 30);
    expect(m.jogadores[0]).toMatchObject({ x: 1, y: 2, mov: null, toque: null });
  });

  it('o quadro devolve o número da última entrada e o passo em que chegou', () => {
    let m = limpa(jogando(nova()), { p0: [1, 1], p1: [13, 11] });
    m = aplicarEntrada(m, 'p0', { dir: 'DIREITA', bomba: false, seq: 7 }, humano);
    const v = project(passo(m));
    expect(v.jogadores[0]).toMatchObject({ entradaSeq: 7, entradaPasso: m.passo });
  });
});

describe('luva', () => {
  const comLuva = (m: MatchState, id = 'p0') => comJogador(m, id, { luva: true });
  const bombaEm = (m: MatchState, x: number, y: number, dono = 'p1', explode = m.passo + 30) => ({
    ...m,
    bombas: [...m.bombas, { id: 900 + m.bombas.length, x, y, dono, alcance: 2, colocadaNoPasso: m.passo, explodeNoPasso: explode, deslize: null, carregadaPor: null, voo: null }],
  });

  it('levanta a bomba da frente, com o pavio parado, e arremessa 2 casas', () => {
    let m = comLuva(limpa(jogando(nova(3)), { p0: [1, 1], p1: [13, 11], p2: [13, 1] }));
    m = comJogador(m, 'p0', { olhando: 'DIREITA' });
    m = bombaEm(m, 2, 1);
    const pavio = m.bombas[0]!.explodeNoPasso - m.passo;
    m = aplicarEntrada(m, 'p0', { dir: null, bomba: true });
    m = passo(m);
    expect(m.bombas[0]!.carregadaPor).toBe('p0');
    expect(m.eventos).toContainEqual({ tipo: 'LEVANTOU', playerId: 'p0' });
    m = passos(m, 100);
    expect(m.bombas[0]!.explodeNoPasso - m.passo).toBe(pavio);
    expect(conferirInvariantes(m)).toEqual([]);
    m = aplicarEntrada(m, 'p0', { dir: null, bomba: true });
    m = passo(m);
    expect(m.bombas[0]).toMatchObject({ x: 1 + ARREMESSO_CASAS, y: 1, carregadaPor: null, voo: { dir: 'DIREITA', casas: 2 } });
    m = passos(m, 4);
    expect(m.bombas[0]!.voo).toBeNull();
    expect(conferirInvariantes(m)).toEqual([]);
  });

  it('caindo em outra bomba, quica para a casa livre seguinte', () => {
    let m = comLuva(limpa(jogando(nova(3)), { p0: [1, 1], p1: [13, 11], p2: [13, 9] }));
    m = comJogador(m, 'p0', { olhando: 'DIREITA' });
    m = bombaEm(m, 2, 1);
    m = bombaEm(m, 3, 1, 'p2', m.passo + 200);
    m = passo(aplicarEntrada(m, 'p0', { dir: null, bomba: true }));
    m = passo(aplicarEntrada(m, 'p0', { dir: null, bomba: true }));
    expect(m.bombas.find((b) => b.id === 900)).toMatchObject({ x: 4, y: 1 });
  });

  it('passando da borda, entra pelo outro lado', () => {
    let m = comLuva(limpa(jogando(nova(3)), { p0: [12, 1], p1: [13, 11], p2: [1, 11] }));
    m = comJogador(m, 'p0', { olhando: 'DIREITA' });
    m = bombaEm(m, 13, 1);
    m = passo(aplicarEntrada(m, 'p0', { dir: null, bomba: true }));
    m = passo(aplicarEntrada(m, 'p0', { dir: null, bomba: true }));
    // De (12,1): 2 casas dá (14,1), a parede; quica para (0,1), parede de novo, e cai em (1,1).
    expect(m.bombas[0]).toMatchObject({ x: 1, y: 1 });
    m = passos(m, 10);
    expect(m.bombas[0]!.voo).toBeNull();
  });

  it('quem morre carregando deixa a bomba cair ali', () => {
    let m = comLuva(limpa(jogando(nova(3)), { p0: [3, 1], p1: [13, 11], p2: [13, 9] }));
    m = comJogador(m, 'p0', { olhando: 'DIREITA' });
    m = bombaEm(m, 4, 1, 'p1', m.passo + 300);
    m = passo(aplicarEntrada(m, 'p0', { dir: null, bomba: true }));
    m = { ...m, chamas: [{ x: 3, y: 1, ateOPasso: m.passo + 5, forma: 'CENTRO', ponta: false, donos: ['p2'] }] };
    m = passo(m);
    expect(jog(m, 'p0').vivo).toBe(false);
    const b = m.bombas.find((x) => x.id === 900)!;
    expect(b.carregadaPor).toBeNull();
    expect(m.itens.map((i) => i.tipo)).toContain('LUVA');
    expect(conferirInvariantes(m)).toEqual([]);
  });
});

describe('fantasma na borda', () => {
  /** p0 morto há tempo bastante, já fantasma na casa `anel` da borda. */
  function comFantasma(lugares: Record<string, [number, number]>, anel: number): MatchState {
    let m = limpa(jogando(nova(3)), lugares);
    m = comJogador(m, 'p0', { vivo: false, morreuNoPasso: m.passo - 30, fantasma: { anel, mov: null } });
    return { ...m, abates: [{ rodada: m.rodada, passo: m.passo - 30, vitima: 'p0', autor: null, ajudantes: [], causa: 'FECHAMENTO', voltou: false }] };
  }

  it('quem morre vira fantasma na casa da borda mais perto, depois de um instante', () => {
    let m = limpa(jogando(nova(3)), { p0: [1, 1], p1: [13, 11], p2: [13, 1] });
    m = passo(aplicarEntrada(m, 'p0', { dir: null, bomba: true }));
    m = passos(m, PAVIO_PASSOS);
    expect(jog(m, 'p0').vivo).toBe(false);
    expect(jog(m, 'p0').fantasma).toBeNull();
    m = passos(m, FANTASMA_APOS_PASSOS);
    const f = jog(m, 'p0').fantasma!;
    expect(anelEm(f.anel)).toEqual([1, 0]);
  });

  it('anda pela borda com as setas dela e dobra o canto segurando a mesma tecla', () => {
    let m = comFantasma({ p1: [13, 11], p2: [13, 9] }, 12); // (12,0), perto do canto (14,0)
    m = aplicarEntrada(m, 'p0', { dir: 'DIREITA', bomba: false });
    m = passos(m, 20);
    const [x, y] = anelEm(jog(m, 'p0').fantasma!.anel);
    expect(x).toBe(14);
    expect(y).toBeGreaterThan(0);
    // Na lateral, ← sobe e → desce: dá para jogar só com as duas.
    const lateral = ANEL.findIndex(([ax, ay]) => ax === 14 && ay === 5);
    const sobe = passos(aplicarEntrada(comFantasma({ p1: [13, 11], p2: [13, 9] }, lateral), 'p0', { dir: 'ESQUERDA', bomba: false }), 10);
    expect(anelEm(jog(sobe, 'p0').fantasma!.anel)).toEqual([14, 3]);
    const desce = passos(aplicarEntrada(comFantasma({ p1: [13, 11], p2: [13, 9] }, lateral), 'p0', { dir: 'DIREITA', bomba: false }), 10);
    expect(anelEm(jog(desce, 'p0').fantasma!.anel)).toEqual([14, 7]);
    expect(conferirInvariantes(m)).toEqual([]);
  });

  it('arremessa para dentro a bomba do começo, uma por vez', () => {
    let m = comFantasma({ p1: [13, 11], p2: [13, 9] }, 3); // (3,0)
    m = comJogador(m, 'p0', { alcance: 6, bombas: 4 });
    m = passo(aplicarEntrada(m, 'p0', { dir: null, bomba: true }));
    expect(m.bombas).toHaveLength(1);
    expect(m.bombas[0]).toMatchObject({ dono: 'p0', alcance: ALCANCE_INICIAL, x: 3, y: 2, voo: { dir: 'BAIXO' } });
    m = passo(aplicarEntrada(m, 'p0', { dir: null, bomba: true }));
    expect(m.bombas).toHaveLength(1);
  });

  it('o fantasma cujo fogo mata alguém volta no lugar dele, sem poderes e protegido por um instante', () => {
    let m = comFantasma({ p1: [3, 3], p2: [13, 9] }, 3);
    m = passo(aplicarEntrada(m, 'p0', { dir: null, bomba: true }));
    m = passos(m, PAVIO_PASSOS + 10);
    expect(jog(m, 'p1').vivo).toBe(false);
    const p0 = jog(m, 'p0');
    expect(p0).toMatchObject({ vivo: true, voltou: true, fantasma: null, alcance: ALCANCE_INICIAL, bombas: 1 });
    expect([p0.x, p0.y]).toEqual([3, 3]);
    expect(m.abates.find((a) => a.vitima === 'p1')).toMatchObject({ autor: 'p0', voltou: true });
    expect(m.fase).toBe('JOGANDO');
    // Nasce dentro do fogo que acabou de acender e não morre por isso.
    m = passos(m, PROTECAO_AO_VOLTAR);
    expect(jog(m, 'p0').vivo).toBe(true);
    expect(conferirInvariantes(m)).toEqual([]);
  });

  it('fantasma não pega item, não leva fogo e não segura a rodada', () => {
    let m = comFantasma({ p1: [3, 3], p2: [13, 9] }, 3);
    m = comItem(m, 1, 1, 'FOGO');
    m = { ...m, chamas: [{ x: 3, y: 0, ateOPasso: m.passo + 5, forma: 'CENTRO', ponta: false, donos: ['p1'] }] };
    m = passo(m);
    expect(m.itens).toHaveLength(1);
    // Morre p2: sobra um vivo, e a rodada acaba mesmo com o fantasma na borda.
    m = { ...m, chamas: [{ x: 13, y: 9, ateOPasso: m.passo + 5, forma: 'CENTRO', ponta: false, donos: ['p1'] }] };
    m = passo(m);
    expect(m.fase).toBe('FIM_DA_RODADA');
    expect(m.vencedorDaRodada).toBe('p1');
  });
});
