/**
 * O motor: um passo de cada vez.
 *
 * `passo(m)` devolve o estado seguinte, sem tocar no anterior. A ordem dentro
 * do passo é parte da regra e está escrita uma vez só, aqui:
 *
 *   1. a caveira que venceu acaba
 *   2. o botão de ação: solta bomba, levanta (luva) ou arremessa — e o
 *      fantasma arremessa da borda
 *   3. todo mundo anda (e quem tem chute empurra a bomba em que esbarra); os
 *      fantasmas andam pela borda
 *   4. bombas chutadas escorregam; as arremessadas voam, e quicam se caem em
 *      casa ocupada; carregada ou no ar, o pavio fica parado
 *   5. o fogo que já durou o bastante se apaga
 *   6. bombas vencidas (e as atingidas por fogo) explodem, em cadeia
 *   7. a arena fecha mais um bloco, se for a hora
 *   8. quem está sobre um item o pega; a caveira passa de um para outro
 *   9. quem está sobre fogo morre, e os itens dele se espalham pela arena; o
 *      fantasma cujo fogo matou alguém volta no lugar de quem morreu
 *  10. a rodada acaba se sobrou um (ou ninguém), ou se a arena fechou toda
 *
 * Morrer DEPOIS de explodir e no mesmo passo para todos é o que faz duas
 * bombas que pegam dois jogadores ao mesmo tempo darem empate, e não vitória
 * de quem estava primeiro na lista.
 */

import {
  ALCANCE_INICIAL,
  ALCANCE_MAX,
  ALTURA,
  ARREMESSO_CASAS,
  BOMBAS_INICIAIS,
  BOMBAS_MAX,
  CONTAGEM_PASSOS,
  DESLIZE_POR_PASSO,
  FANTASMA_APOS_PASSOS,
  FECHAMENTO_INTERVALO_PASSOS,
  FIM_DA_RODADA_PASSOS,
  FOGO_PASSOS,
  IMUNE_APOS_PASSAR,
  LARGURA,
  MALDICAO_PASSOS,
  MAX_JOGADORES,
  MIN_JOGADORES,
  PASSOS_POR_SEGUNDO,
  PAVIO_PASSOS,
  PROTECAO_AO_VOLTAR,
  TOQUE_PASSOS,
  UNIDADE,
  VELOCIDADE_BASE,
  VELOCIDADE_MAX_NIVEL,
  VOO_POR_PASSO,
  fechamentoEmPassos,
} from './constantes.js';
import { ESPIRAL } from './fechamento.js';
import {
  anelEm,
  anelMaisPerto,
  DELTA,
  dentro,
  gerarArena,
  indice,
  NASCEDOUROS,
  OPOSTA,
  paraDentro,
  sentidoNoAnel,
} from './mapa.js';
import { moverJogador } from './movimento.js';
import { ANEL } from './mapa.js';

const ANEL_TAM = ANEL.length;
import { createRng } from './rng.js';
import {
  CAIXA,
  CHAO,
  DIRECOES,
  MALDICOES,
  PAREDE,
  type Bomba,
  type Chama,
  type Dir,
  type EndReason,
  type Entrada,
  type Fantasma,
  type JogadorNoJogo,
  type MatchOptions,
  type MatchState,
  type PlayerId,
  type TipoItem,
} from './types.js';

/** Do primeiro bloco ao último: a espiral inteira, e a rodada acaba logo depois. */
const DURACAO_DO_FECHAMENTO = ESPIRAL.length * FECHAMENTO_INTERVALO_PASSOS + PASSOS_POR_SEGUNDO;

export interface CreateMatchParams {
  matchId: string;
  seed: string;
  playerIds: PlayerId[];
  options: MatchOptions;
}

export function createMatch({ matchId, seed, playerIds, options }: CreateMatchParams): MatchState {
  if (playerIds.length < MIN_JOGADORES || playerIds.length > MAX_JOGADORES) {
    throw new RangeError(`partida precisa de ${MIN_JOGADORES} a ${MAX_JOGADORES} jogadores`);
  }
  if (new Set(playerIds).size !== playerIds.length) throw new Error('jogador repetido na partida');

  const placar: Record<PlayerId, number> = {};
  for (const id of playerIds) placar[id] = 0;

  const vazio: MatchState = {
    id: matchId,
    seed,
    options: { ...options },
    playerOrder: [...playerIds],
    passo: 0,
    rodada: 0,
    fase: 'CONTAGEM',
    faseAtePasso: 0,
    fechaNoPasso: 0,
    fechadas: 0,
    grade: [],
    gradeVersao: 0,
    jogadores: [],
    bombas: [],
    chamas: [],
    itens: [],
    ocultos: {},
    proximaBomba: 1,
    placar,
    abates: [],
    vencedorDaRodada: null,
    endReason: null,
    campeao: null,
    eventos: [],
  };
  return iniciarRodada(vazio, 1);
}

/**
 * Arena nova e lugares sorteados a cada rodada. O sorteio usa a semente da
 * partida e o número da rodada, então a mesma partida repetida dá as mesmas
 * arenas — e duas rodadas da mesma partida não dão a mesma.
 */
function iniciarRodada(m: MatchState, rodada: number): MatchState {
  const rng = createRng(`${m.seed}:rodada:${rodada}`);
  const { grade, ocultos } = gerarArena(rng);

  const ordem = [...m.playerOrder];
  for (let i = ordem.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    [ordem[i], ordem[j]] = [ordem[j]!, ordem[i]!];
  }

  const jogadores: JogadorNoJogo[] = ordem.map((id, i) => {
    const [x, y] = NASCEDOUROS[i]!;
    return {
      id,
      x,
      y,
      mov: null,
      olhando: 'BAIXO',
      querDir: null,
      querBomba: false,
      vivo: true,
      morreuNoPasso: null,
      alcance: ALCANCE_INICIAL,
      velocidade: 0,
      bombas: BOMBAS_INICIAIS,
      chute: false,
      luva: false,
      maldicao: null,
      imuneAte: 0,
      toque: null,
      fantasma: null,
      voltou: false,
      protegidoAte: 0,
      entradaSeq: 0,
      entradaPasso: 0,
    };
  });
  // A numeração das entradas atravessa as rodadas: o cliente não recomeça a dele.
  for (const j of jogadores) {
    const antes = m.jogadores.find((k) => k.id === j.id);
    if (antes) {
      j.entradaSeq = antes.entradaSeq;
      j.entradaPasso = antes.entradaPasso;
    }
  }
  // A lista volta para a ordem da partida: o desenho e o placar não dançam.
  jogadores.sort((a, b) => m.playerOrder.indexOf(a.id) - m.playerOrder.indexOf(b.id));

  return {
    ...m,
    rodada,
    fase: 'CONTAGEM',
    faseAtePasso: m.passo + CONTAGEM_PASSOS,
    fechaNoPasso: m.passo + CONTAGEM_PASSOS + fechamentoEmPassos(m.options.fechamento),
    fechadas: 0,
    grade,
    gradeVersao: m.gradeVersao + 1,
    jogadores,
    bombas: [],
    chamas: [],
    itens: [],
    ocultos,
    vencedorDaRodada: null,
    eventos: [],
  };
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

/** A casa em que o jogador conta como estando: a mais próxima do corpo. */
export function casaOcupada(j: JogadorNoJogo): [number, number] {
  if (!j.mov || j.mov.progresso < UNIDADE / 2) return [j.x, j.y];
  const [dx, dy] = DELTA[j.mov.dir];
  return [j.x + dx, j.y + dy];
}

/** Bomba no chão: nem na mão de alguém, nem no ar. Só ela ocupa casa e explode. */
export const noChao = (b: Pick<Bomba, 'carregadaPor' | 'voo'>): boolean => b.carregadaPor === null && b.voo === null;

export const bombaEm = (m: Pick<MatchState, 'bombas'>, x: number, y: number): Bomba | undefined =>
  m.bombas.find((b) => b.x === x && b.y === y && noChao(b));

export const queimando = (m: MatchState, x: number, y: number): boolean =>
  m.chamas.some((c) => c.x === x && c.y === y);

/** Dá para ENTRAR nesta casa? Fogo não barra: barra a morte, que é pior. */
export function livre(m: Pick<MatchState, 'grade' | 'bombas'>, x: number, y: number): boolean {
  return dentro(x, y) && m.grade[indice(x, y)] === CHAO && !bombaEm(m, x, y);
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

/**
 * O que a pessoa (ou o bot) está apertando. Guardado no estado e consumido pelo
 * passo seguinte — a entrada não move ninguém sozinha, só o passo move.
 *
 * `guardarToque` é para entrada de gente: a direção apertada fica valendo por
 * `TOQUE_PASSOS` mesmo se a tecla subir antes do passo (ver `movimento.ts`).
 * O bot decide a cada passo e não precisa — e com o toque guardado ele
 * andaria uma casa a mais do que decidiu.
 *
 * Morto também aperta: é o fantasma andando pela borda.
 */
export function aplicarEntrada(
  m: MatchState,
  playerId: PlayerId,
  entrada: Entrada,
  opcoes: { guardarToque?: boolean } = {},
): MatchState {
  const j = m.jogadores.find((x) => x.id === playerId);
  if (!j) return m;
  const novaSeq = entrada.seq !== undefined && entrada.seq > j.entradaSeq;
  // Tecla nova vira toque — menos a que só repete o rumo em que já anda (é o
  // que chega quando a pessoa solta a curva e volta à tecla que segurava; se
  // contasse, apagaria a curva pedida).
  const rumo = j.mov && j.maldicao?.tipo === 'INVERTIDO' ? OPOSTA[j.mov.dir] : j.mov?.dir;
  const novoToque =
    opcoes.guardarToque === true && j.vivo && entrada.dir !== null && entrada.dir !== j.querDir && entrada.dir !== rumo;
  if (!novaSeq && !novoToque && j.querDir === entrada.dir && (!entrada.bomba || j.querBomba)) return m;
  return {
    ...m,
    jogadores: m.jogadores.map((x) =>
      x.id === playerId
        ? {
            ...x,
            querDir: entrada.dir,
            querBomba: x.querBomba || entrada.bomba,
            toque: novoToque ? { dir: entrada.dir!, ate: m.passo + TOQUE_PASSOS } : x.toque,
            entradaSeq: novaSeq ? entrada.seq! : x.entradaSeq,
            entradaPasso: novaSeq ? m.passo : x.entradaPasso,
          }
        : x,
    ),
  };
}

// ---------------------------------------------------------------------------
// O passo
// ---------------------------------------------------------------------------

export function passo(anterior: MatchState): MatchState {
  if (anterior.endReason !== null) return anterior;
  const m: MatchState = structuredClone(anterior);
  m.eventos = [];
  m.passo += 1;
  const agora = m.passo;

  if (m.fase === 'CONTAGEM') {
    // Bomba apertada na contagem não fica guardada para o primeiro passo.
    for (const j of m.jogadores) j.querBomba = false;
    if (agora >= m.faseAtePasso) {
      m.fase = 'JOGANDO';
      // O teto da rodada é a arena fechada por inteiro.
      m.faseAtePasso = m.fechaNoPasso + DURACAO_DO_FECHAMENTO;
    }
    return m;
  }

  if (m.fase === 'FIM_DA_RODADA') {
    if (agora < m.faseAtePasso) return m;
    return proximaRodadaOuFim(m);
  }

  for (const j of m.jogadores) if (j.maldicao && j.maldicao.atePasso <= agora) j.maldicao = null;
  acoes(m, agora);
  mover(m, agora);
  moverFantasmas(m, agora);
  deslizar(m);
  voar(m);
  // Na mão ou no ar, o pavio não corre.
  for (const b of m.bombas) if (!noChao(b)) b.explodeNoPasso += 1;
  m.chamas = m.chamas.filter((c) => c.ateOPasso > agora);
  explodir(m, agora);
  fechar(m, agora);
  coletar(m, agora);
  passarCaveira(m, agora);
  matar(m, agora);
  conferirFimDaRodada(m, agora);
  return m;
}

/**
 * O botão de ação. Vivo: com uma bomba na mão, arremessa; com a luva e uma
 * bomba parada logo à frente, levanta; senão, solta uma bomba onde está.
 * Fantasma: arremessa uma bomba da borda para dentro.
 */
function acoes(m: MatchState, agora: number): void {
  for (const j of m.jogadores) {
    if (!j.querBomba) continue;
    j.querBomba = false;
    if (!j.vivo) {
      arremessoDoFantasma(m, j, agora);
      continue;
    }
    const naMao = m.bombas.find((b) => b.carregadaPor === j.id);
    if (naMao) {
      arremessar(m, j, naMao);
      continue;
    }
    if (j.luva && levantar(m, j)) continue;
    if (j.maldicao?.tipo === 'SEM_BOMBA') continue;
    const [x, y] = casaOcupada(j);
    if (bombaEm(m, x, y)) continue;
    if (m.bombas.filter((b) => b.dono === j.id).length >= j.bombas) continue;
    m.bombas.push(novaBomba(m, j.id, x, y, j.alcance, agora));
    m.eventos.push({ tipo: 'BOMBA', playerId: j.id });
  }
}

function novaBomba(m: MatchState, dono: PlayerId, x: number, y: number, alcance: number, agora: number): Bomba {
  return {
    id: m.proximaBomba++,
    x,
    y,
    dono,
    alcance,
    colocadaNoPasso: agora,
    explodeNoPasso: agora + PAVIO_PASSOS,
    deslize: null,
    carregadaPor: null,
    voo: null,
  };
}

/** A casa logo à frente de quem olha para `j.olhando`. */
function aFrente(j: JogadorNoJogo): [number, number] {
  const [x, y] = casaOcupada(j);
  const [dx, dy] = DELTA[j.olhando];
  return [x + dx, y + dy];
}

function levantar(m: MatchState, j: JogadorNoJogo): boolean {
  const [fx, fy] = aFrente(j);
  const b = bombaEm(m, fx, fy);
  if (!b || b.deslize) return false;
  b.carregadaPor = j.id;
  [b.x, b.y] = casaOcupada(j);
  m.eventos.push({ tipo: 'LEVANTOU', playerId: j.id });
  return true;
}

/**
 * Casa onde uma bomba no ar pode descer: chão, sem bomba parada, sem item e
 * sem gente viva. Cair em cima de qualquer outra coisa é quicar adiante.
 */
/** O que o arremesso precisa enxergar — o bot passa a visão dele. */
export type MundoDoArremesso = Pick<MatchState, 'grade' | 'bombas' | 'jogadores'> & {
  itens: readonly { x: number; y: number }[];
};

function pousoLivre(m: MundoDoArremesso, x: number, y: number): boolean {
  if (!livre(m, x, y)) return false;
  if (m.itens.some((it) => it.x === x && it.y === y)) return false;
  return !m.jogadores.some((k) => {
    if (!k.vivo) return false;
    const [cx, cy] = casaOcupada(k);
    return cx === x && cy === y;
  });
}

/**
 * Onde cai uma bomba arremessada de (x, y) na direção `d`: `casas` adiante e,
 * se ali não dá para descer, quica casa a casa na mesma direção até achar uma.
 * Passando da borda, entra pelo outro lado da arena. `null` se a linha inteira
 * está tomada.
 */
export function destinoDoArremesso(
  m: MundoDoArremesso,
  x: number,
  y: number,
  d: Dir,
  casas: number,
): { x: number; y: number; casas: number } | null {
  const [dx, dy] = DELTA[d];
  const volta = dx === 0 ? ALTURA : LARGURA;
  for (let k = casas; k <= casas + volta; k++) {
    const cx = (((x + dx * k) % LARGURA) + LARGURA) % LARGURA;
    const cy = (((y + dy * k) % ALTURA) + ALTURA) % ALTURA;
    if (pousoLivre(m, cx, cy)) return { x: cx, y: cy, casas: k };
  }
  return null;
}

function lancar(m: MatchState, b: Bomba, deX: number, deY: number, d: Dir): boolean {
  const alvo = destinoDoArremesso(m, deX, deY, d, ARREMESSO_CASAS);
  if (!alvo) return false;
  b.carregadaPor = null;
  b.deslize = null;
  b.x = alvo.x;
  b.y = alvo.y;
  b.voo = { dir: d, deX, deY, casas: alvo.casas, progresso: 0 };
  return true;
}

function arremessar(m: MatchState, j: JogadorNoJogo, b: Bomba): void {
  const [x, y] = casaOcupada(j);
  if (lancar(m, b, x, y, j.olhando)) m.eventos.push({ tipo: 'ARREMESSO', playerId: j.id });
}

/**
 * O fantasma arremessa da borda para dentro: sempre a bomba do começo (uma
 * por vez, fogo inicial), por melhor que estivesse quando morreu.
 */
function arremessoDoFantasma(m: MatchState, j: JogadorNoJogo, agora: number): void {
  const f = j.fantasma;
  if (!f || m.bombas.some((b) => b.dono === j.id)) return;
  const casa = casaDoFantasma(f);
  const d = paraDentro(casa);
  if (!d) return;
  const [x, y] = anelEm(casa);
  const b = novaBomba(m, j.id, x, y, ALCANCE_INICIAL, agora);
  if (!lancar(m, b, x, y, d)) return;
  m.bombas.push(b);
  m.eventos.push({ tipo: 'ARREMESSO', playerId: j.id });
}

/** A casa do anel em que o fantasma conta como estando: a mais próxima. */
export function casaDoFantasma(f: Fantasma): number {
  if (!f.mov || f.mov.progresso < UNIDADE / 2) return f.anel;
  return (f.anel + f.mov.sentido + ANEL_TAM) % ANEL_TAM;
}

function mover(m: MatchState, agora: number): void {
  for (const j of m.jogadores) {
    if (!j.vivo) continue;
    moverJogador(j, agora, (x, y) => livre(m, x, y), j.chute ? (d) => chutar(m, j, d) : undefined);
    // A bomba na mão vai junto.
    for (const b of m.bombas) if (b.carregadaPor === j.id) [b.x, b.y] = casaOcupada(j);
  }
}

/**
 * O fantasma anda pela borda, casa a casa, com as setas que apontam ao longo
 * dela. Segurando a mesma tecla, dobra o canto sozinho.
 */
function moverFantasmas(m: MatchState, agora: number): void {
  for (const j of m.jogadores) {
    if (j.vivo) continue;
    if (!j.fantasma) {
      if (j.morreuNoPasso === null || agora < j.morreuNoPasso + FANTASMA_APOS_PASSOS) continue;
      j.fantasma = { anel: anelMaisPerto(j.x, j.y), mov: null };
    }
    const f = j.fantasma;
    const d = j.querDir;
    let resto = VELOCIDADE_BASE;
    let inverteu = false;
    while (resto > 0) {
      if (!f.mov) {
        const s = d === null ? null : sentidoNoAnel(f.anel, d);
        if (s === null || d === null) break;
        f.mov = { sentido: s, progresso: 0, segurando: d };
      } else if (!inverteu && d !== null && d !== f.mov.segurando && sentidoNoAnel(f.anel, d) === -f.mov.sentido) {
        // Meia-volta no meio do caminho, como no chão.
        inverteu = true;
        f.anel = (f.anel + f.mov.sentido + ANEL_TAM) % ANEL_TAM;
        f.mov = { sentido: -f.mov.sentido as 1 | -1, progresso: UNIDADE - f.mov.progresso, segurando: d };
      }
      const anda = Math.min(resto, UNIDADE - f.mov.progresso);
      f.mov.progresso += anda;
      resto -= anda;
      if (f.mov.progresso < UNIDADE) break;
      f.anel = (f.anel + f.mov.sentido + ANEL_TAM) % ANEL_TAM;
      const segue = d !== null && (d === f.mov.segurando || sentidoNoAnel(f.anel, d) === f.mov.sentido);
      const sentido = f.mov.sentido;
      f.mov = null;
      if (!segue || inverteu) break;
      f.mov = { sentido, progresso: 0, segurando: d };
    }
  }
}

/**
 * Bomba pode escorregar para esta casa? Para em tudo: bloco, outra bomba,
 * item e gente.
 */
function livreParaBomba(m: MatchState, x: number, y: number): boolean {
  if (!livre(m, x, y)) return false;
  if (m.itens.some((it) => it.x === x && it.y === y)) return false;
  return !m.jogadores.some((j) => {
    if (!j.vivo) return false;
    const [cx, cy] = casaOcupada(j);
    return cx === x && cy === y;
  });
}

/** Quem tem chute e anda contra uma bomba parada a empurra, se ela tem para onde ir. */
function chutar(m: MatchState, j: JogadorNoJogo, d: Dir): void {
  const [dx, dy] = DELTA[d];
  const b = bombaEm(m, j.x + dx, j.y + dy);
  if (!b || b.deslize) return;
  if (!livreParaBomba(m, b.x + dx, b.y + dy)) return;
  b.deslize = { dir: d, progresso: 0 };
  m.eventos.push({ tipo: 'CHUTE', playerId: j.id });
}

/**
 * Bomba chutada escorrega casa a casa. Ela conta como estando na casa de onde
 * saiu até chegar inteira na seguinte; antes de cada casa nova confere de novo
 * o caminho, porque alguém pode ter entrado na frente.
 */
function deslizar(m: MatchState): void {
  for (const b of m.bombas) {
    if (!b.deslize) continue;
    const [dx, dy] = DELTA[b.deslize.dir];
    if (!livreParaBomba(m, b.x + dx, b.y + dy)) {
      b.deslize = null;
      continue;
    }
    b.deslize.progresso += DESLIZE_POR_PASSO;
    if (b.deslize.progresso < UNIDADE) continue;
    b.x += dx;
    b.y += dy;
    b.deslize.progresso -= UNIDADE;
    if (!livreParaBomba(m, b.x + dx, b.y + dy)) b.deslize = null;
  }
}

/**
 * Bomba no ar anda `VOO_POR_PASSO` por passo. Ao chegar, se a casa ficou
 * ocupada no caminho (alguém entrou, outra bomba pousou), quica adiante.
 */
function voar(m: MatchState): void {
  for (const b of [...m.bombas]) {
    if (!b.voo) continue;
    b.voo.progresso += VOO_POR_PASSO;
    if (b.voo.progresso < b.voo.casas * UNIDADE) continue;
    b.voo.progresso = b.voo.casas * UNIDADE;
    if (pousoLivre(m, b.x, b.y)) {
      b.voo = null;
      continue;
    }
    const adiante = destinoDoArremesso(m, b.x, b.y, b.voo.dir, 1);
    if (!adiante) {
      m.bombas = m.bombas.filter((x) => x !== b);
      continue;
    }
    b.x = adiante.x;
    b.y = adiante.y;
    b.voo.casas += adiante.casas;
  }
}

function acenderChama(m: MatchState, nova: Chama): void {
  const ja = m.chamas.find((c) => c.x === nova.x && c.y === nova.y);
  if (!ja) {
    m.chamas.push(nova);
    return;
  }
  for (const d of nova.donos) if (!ja.donos.includes(d)) ja.donos.push(d);
  ja.ateOPasso = Math.max(ja.ateOPasso, nova.ateOPasso);
  // Dois braços se cruzando viram um centro: é o que o desenho precisa saber.
  if (ja.forma !== nova.forma) ja.forma = 'CENTRO';
  ja.ponta = ja.ponta && nova.ponta;
}

/** Explosão em cadeia: fogo que encosta numa bomba a detona no mesmo passo. */
function explodir(m: MatchState, agora: number): void {
  const fila: Bomba[] = m.bombas.filter((b) => noChao(b) && (b.explodeNoPasso <= agora || queimando(m, b.x, b.y)));
  const ate = agora + FOGO_PASSOS;

  while (fila.length > 0) {
    const b = fila.shift()!;
    if (!m.bombas.includes(b)) continue;
    m.bombas = m.bombas.filter((x) => x !== b);
    m.eventos.push({ tipo: 'EXPLOSAO', x: b.x, y: b.y });
    acenderChama(m, { x: b.x, y: b.y, ateOPasso: ate, forma: 'CENTRO', ponta: false, donos: [b.dono] });

    for (const d of DIRECOES) {
      const [dx, dy] = DELTA[d];
      const forma = dx === 0 ? 'V' : 'H';
      for (let k = 1; k <= b.alcance; k++) {
        const x = b.x + dx * k;
        const y = b.y + dy * k;
        if (!dentro(x, y)) break;
        const i = indice(x, y);
        const celula = m.grade[i];
        if (celula === PAREDE) break;

        if (celula === CAIXA) {
          m.grade[i] = CHAO;
          m.gradeVersao += 1;
          const escondido = m.ocultos[i];
          if (escondido) {
            delete m.ocultos[i];
            m.itens.push({ x, y, tipo: escondido, visivelNoPasso: ate });
          }
          acenderChama(m, { x, y, ateOPasso: ate, forma, ponta: true, donos: [b.dono] });
          break;
        }

        const outra = bombaEm(m, x, y);
        if (outra) {
          acenderChama(m, { x, y, ateOPasso: ate, forma, ponta: true, donos: [b.dono] });
          if (!fila.includes(outra)) fila.push(outra);
          break;
        }

        const item = m.itens.find((it) => it.x === x && it.y === y && it.visivelNoPasso <= agora);
        if (item) {
          m.itens = m.itens.filter((it) => it !== item);
          acenderChama(m, { x, y, ateOPasso: ate, forma, ponta: true, donos: [b.dono] });
          break;
        }

        acenderChama(m, { x, y, ateOPasso: ate, forma, ponta: k === b.alcance, donos: [b.dono] });
      }
    }
  }
}

/** Quantas casas da espiral já devem ter fechado neste passo. */
export function fechadasEm(fechaNoPasso: number, agora: number): number {
  if (agora < fechaNoPasso) return 0;
  return Math.min(ESPIRAL.length, Math.floor((agora - fechaNoPasso) / FECHAMENTO_INTERVALO_PASSOS) + 1);
}

function fechar(m: MatchState, agora: number): void {
  const alvo = fechadasEm(m.fechaNoPasso, agora);
  while (m.fechadas < alvo) {
    const i = ESPIRAL[m.fechadas]!;
    m.fechadas += 1;
    const x = i % LARGURA;
    const y = Math.floor(i / LARGURA);
    m.grade[i] = PAREDE;
    m.gradeVersao += 1;
    delete m.ocultos[i];
    m.bombas = m.bombas.filter((b) => !noChao(b) || b.x !== x || b.y !== y);
    m.itens = m.itens.filter((it) => it.x !== x || it.y !== y);
    m.chamas = m.chamas.filter((c) => c.x !== x || c.y !== y);
    m.eventos.push({ tipo: 'FECHOU', x, y });
    // Quem está na casa, ou entrando nela, é esmagado; quem estava saindo
    // dela é empurrado para a casa de destino.
    for (const j of m.jogadores) {
      if (!j.vivo) continue;
      const [ox, oy] = casaOcupada(j);
      if (ox === x && oy === y) {
        morrer(m, j, agora, null, [], 'FECHAMENTO');
        continue;
      }
      if (!j.mov) continue;
      const [dx, dy] = DELTA[j.mov.dir];
      if (j.x === x && j.y === y) {
        j.x += dx;
        j.y += dy;
        j.mov = null;
      } else if (j.x + dx === x && j.y + dy === y) {
        // Ia entrar na casa que fechou: volta para o centro de onde saiu.
        j.mov = null;
      }
    }
  }
}

function coletar(m: MatchState, agora: number): void {
  for (const j of m.jogadores) {
    if (!j.vivo) continue;
    const [x, y] = casaOcupada(j);
    const item = m.itens.find((it) => it.x === x && it.y === y && it.visivelNoPasso <= agora);
    if (!item) continue;
    m.itens = m.itens.filter((it) => it !== item);
    m.eventos.push({ tipo: 'PEGOU', playerId: j.id, item: item.tipo });
    switch (item.tipo) {
      case 'FOGO': j.alcance = Math.min(ALCANCE_MAX, j.alcance + 1); break;
      case 'VELOCIDADE': j.velocidade = Math.min(VELOCIDADE_MAX_NIVEL, j.velocidade + 1); break;
      case 'BOMBA': j.bombas = Math.min(BOMBAS_MAX, j.bombas + 1); break;
      case 'CHUTE': j.chute = true; break;
      case 'LUVA': j.luva = true; break;
      case 'CAVEIRA': {
        // Qual maldição sai da semente e do passo: sorteio, mas repetível.
        const rng = createRng(`${m.seed}:caveira:${agora}:${j.id}`);
        const tipo = MALDICOES[rng.nextInt(MALDICOES.length)]!;
        j.maldicao = { tipo, atePasso: agora + MALDICAO_PASSOS };
        m.eventos.push({ tipo: 'MALDICAO', playerId: j.id, maldicao: tipo, de: null });
        break;
      }
    }
  }
}

/**
 * Quem está com a caveira e cruza com alguém sem ela passa a maldição adiante
 * (a mesma, com o tempo cheio) e fica livre. Quem acabou de passar não a pega
 * de volta enquanto os dois ainda estão na mesma casa.
 */
function passarCaveira(m: MatchState, agora: number): void {
  const recebeu = new Set<PlayerId>();
  for (const j of m.jogadores) {
    if (!j.vivo || !j.maldicao || recebeu.has(j.id)) continue;
    const [x, y] = casaOcupada(j);
    const alvo = m.jogadores.find((k) => {
      if (k === j || !k.vivo || k.maldicao || k.imuneAte > agora) return false;
      const [kx, ky] = casaOcupada(k);
      return kx === x && ky === y;
    });
    if (!alvo) continue;
    alvo.maldicao = { tipo: j.maldicao.tipo, atePasso: agora + MALDICAO_PASSOS };
    m.eventos.push({ tipo: 'MALDICAO', playerId: alvo.id, maldicao: j.maldicao.tipo, de: j.id });
    j.maldicao = null;
    j.imuneAte = agora + IMUNE_APOS_PASSAR;
    recebeu.add(alvo.id);
  }
}

function matar(m: MatchState, agora: number): void {
  const voltam = new Map<PlayerId, [number, number]>();
  for (const j of m.jogadores) {
    if (!j.vivo || j.protegidoAte > agora) continue;
    const [x, y] = casaOcupada(j);
    const chama = m.chamas.find((c) => c.x === x && c.y === y);
    if (!chama) continue;
    // O autor é o dono de outro fogo que chegou ali; só a própria bomba é suicídio.
    const autor = chama.donos.find((d) => d !== j.id) ?? (chama.donos.includes(j.id) ? j.id : null);
    const ajudantes = chama.donos.filter((d) => d !== autor && d !== j.id);
    // Fogo de fantasma que mata traz o fantasma de volta, no lugar de quem caiu.
    const fantasma = m.jogadores.find((k) => k.id === autor && k !== j && !k.vivo && k.fantasma !== null);
    const volta = fantasma !== undefined && !voltam.has(fantasma.id);
    if (volta) voltam.set(fantasma.id, [x, y]);
    morrer(m, j, agora, autor, ajudantes, 'FOGO', volta);
  }
  for (const [id, [x, y]] of voltam) {
    const k = m.jogadores.find((j) => j.id === id)!;
    k.vivo = true;
    k.morreuNoPasso = null;
    k.fantasma = null;
    k.x = x;
    k.y = y;
    k.mov = null;
    k.toque = null;
    k.olhando = 'BAIXO';
    k.voltou = true;
    k.protegidoAte = agora + PROTECAO_AO_VOLTAR;
    m.eventos.push({ tipo: 'VOLTOU', playerId: id });
  }
}

function morrer(
  m: MatchState,
  j: JogadorNoJogo,
  agora: number,
  autor: PlayerId | null,
  ajudantes: PlayerId[],
  causa: 'FOGO' | 'FECHAMENTO',
  voltou = false,
): void {
  j.vivo = false;
  j.morreuNoPasso = agora;
  j.mov = null;
  j.querDir = null;
  j.toque = null;
  j.fantasma = null;
  m.abates.push({ rodada: m.rodada, passo: agora, vitima: j.id, autor, ajudantes, causa, voltou });
  // A bomba que estava na mão cai ali mesmo (ou quica adiante, se não cabe).
  const naMao = m.bombas.find((b) => b.carregadaPor === j.id);
  if (naMao) {
    const [x, y] = casaOcupada(j);
    const pouso = destinoDoArremesso(m, x, y, j.olhando, 0);
    if (pouso) {
      naMao.carregadaPor = null;
      naMao.x = pouso.x;
      naMao.y = pouso.y;
      if (pouso.casas > 0) naMao.voo = { dir: j.olhando, deX: x, deY: y, casas: pouso.casas, progresso: 0 };
    } else {
      m.bombas = m.bombas.filter((b) => b !== naMao);
    }
  }
  m.eventos.push({ tipo: 'MORTE', playerId: j.id, autor });
  espalharItens(m, j, agora);
}

/**
 * Quem morre devolve à arena o que tinha pegado: cada nível de fogo, de
 * velocidade e de bomba, o chute e a caveira viram itens em casas livres
 * sorteadas — longe do fogo e da parede que vem vindo.
 */
function espalharItens(m: MatchState, j: JogadorNoJogo, agora: number): void {
  const devolver: TipoItem[] = [];
  for (let k = ALCANCE_INICIAL; k < j.alcance; k++) devolver.push('FOGO');
  for (let k = 0; k < j.velocidade; k++) devolver.push('VELOCIDADE');
  for (let k = BOMBAS_INICIAIS; k < j.bombas; k++) devolver.push('BOMBA');
  if (j.chute) devolver.push('CHUTE');
  if (j.luva) devolver.push('LUVA');
  if (j.maldicao) devolver.push('CAVEIRA');
  j.alcance = ALCANCE_INICIAL;
  j.velocidade = 0;
  j.bombas = BOMBAS_INICIAIS;
  j.chute = false;
  j.luva = false;
  j.maldicao = null;
  if (devolver.length === 0) return;

  // As casas que a espiral fecha nos próximos 5 s ficam de fora.
  const fechandoLogo = new Set(ESPIRAL.slice(0, fechadasEm(m.fechaNoPasso, agora + 5 * PASSOS_POR_SEGUNDO)));
  const ocupadas = new Set(m.jogadores.filter((k) => k.vivo).map((k) => indice(...casaOcupada(k))));
  const livres: number[] = [];
  for (let i = 0; i < m.grade.length; i++) {
    if (m.grade[i] !== CHAO || fechandoLogo.has(i) || ocupadas.has(i)) continue;
    const x = i % LARGURA;
    const y = Math.floor(i / LARGURA);
    if (bombaEm(m, x, y) || queimando(m, x, y) || m.itens.some((it) => it.x === x && it.y === y)) continue;
    livres.push(i);
  }
  const rng = createRng(`${m.seed}:espalha:${agora}:${j.id}`);
  for (const tipo of devolver) {
    if (livres.length === 0) break;
    const i = livres.splice(rng.nextInt(livres.length), 1)[0]!;
    m.itens.push({ x: i % LARGURA, y: Math.floor(i / LARGURA), tipo, visivelNoPasso: agora });
  }
}

function conferirFimDaRodada(m: MatchState, agora: number): void {
  const vivos = m.jogadores.filter((j) => j.vivo);
  if (vivos.length > 1 && agora < m.faseAtePasso) return;
  const vencedor = vivos.length === 1 ? vivos[0]!.id : null;
  if (vencedor) m.placar[vencedor] = (m.placar[vencedor] ?? 0) + 1;
  m.vencedorDaRodada = vencedor;
  m.fase = 'FIM_DA_RODADA';
  m.faseAtePasso = agora + FIM_DA_RODADA_PASSOS;
  for (const j of m.jogadores) {
    j.querDir = null;
    j.querBomba = false;
    j.toque = null;
  }
}

function proximaRodadaOuFim(m: MatchState): MatchState {
  const campeao = m.playerOrder.find((id) => (m.placar[id] ?? 0) >= m.options.vitorias);
  if (campeao) return { ...m, endReason: 'VITORIA', campeao };
  return iniciarRodada(m, m.rodada + 1);
}

/** O anfitrião encerrou: quem liderava sozinho leva; empate no topo, ninguém. */
export function endMatch(m: MatchState, reason: Exclude<EndReason, 'VITORIA'>): MatchState {
  if (m.endReason !== null) return m;
  const melhor = Math.max(...m.playerOrder.map((id) => m.placar[id] ?? 0));
  const lideres = m.playerOrder.filter((id) => (m.placar[id] ?? 0) === melhor);
  return { ...m, endReason: reason, campeao: melhor > 0 && lideres.length === 1 ? lideres[0]! : null };
}
