/**
 * O motor: um passo de cada vez.
 *
 * `passo(m)` devolve o estado seguinte, sem tocar no anterior. A ordem dentro
 * do passo é parte da regra e está escrita uma vez só, aqui:
 *
 *   1. bombas pedidas são colocadas
 *   2. todo mundo anda
 *   3. o fogo que já durou o bastante se apaga
 *   4. bombas vencidas (e as atingidas por fogo) explodem, em cadeia
 *   5. quem está sobre um item o pega
 *   6. quem está sobre fogo morre
 *   7. a rodada acaba se sobrou um (ou ninguém), ou se o tempo esgotou
 *
 * Morrer DEPOIS de explodir e no mesmo passo para todos é o que faz duas
 * bombas que pegam dois jogadores ao mesmo tempo darem empate, e não vitória
 * de quem estava primeiro na lista.
 */

import {
  ALCANCE_INICIAL,
  ALCANCE_MAX,
  BOMBAS_POR_JOGADOR,
  CONTAGEM_PASSOS,
  FECHAMENTO_APOS_PASSOS,
  FECHAMENTO_INTERVALO_PASSOS,
  FIM_DA_RODADA_PASSOS,
  FOGO_PASSOS,
  LARGURA,
  MAX_JOGADORES,
  MIN_JOGADORES,
  PAVIO_PASSOS,
  RODADA_PASSOS,
  UNIDADE,
  VELOCIDADE_BASE,
  VELOCIDADE_MAX_NIVEL,
  VELOCIDADE_POR_NIVEL,
} from './constantes.js';
import { ESPIRAL } from './fechamento.js';
import { DELTA, dentro, gerarArena, indice, NASCEDOUROS, OPOSTA } from './mapa.js';
import { createRng } from './rng.js';
import {
  CAIXA,
  CHAO,
  DIRECOES,
  PAREDE,
  type Bomba,
  type Chama,
  type EndReason,
  type Entrada,
  type JogadorNoJogo,
  type MatchOptions,
  type MatchState,
  type PlayerId,
} from './types.js';

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
    };
  });
  // A lista volta para a ordem da partida: o desenho e o placar não dançam.
  jogadores.sort((a, b) => m.playerOrder.indexOf(a.id) - m.playerOrder.indexOf(b.id));

  return {
    ...m,
    rodada,
    fase: 'CONTAGEM',
    faseAtePasso: m.passo + CONTAGEM_PASSOS,
    fechaNoPasso: m.passo + CONTAGEM_PASSOS + FECHAMENTO_APOS_PASSOS,
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

export const velocidadeDe = (j: JogadorNoJogo): number => VELOCIDADE_BASE + j.velocidade * VELOCIDADE_POR_NIVEL;

/** A casa em que o jogador conta como estando: a mais próxima do corpo. */
export function casaOcupada(j: JogadorNoJogo): [number, number] {
  if (!j.mov || j.mov.progresso < UNIDADE / 2) return [j.x, j.y];
  const [dx, dy] = DELTA[j.mov.dir];
  return [j.x + dx, j.y + dy];
}

export const bombaEm = (m: MatchState, x: number, y: number): Bomba | undefined =>
  m.bombas.find((b) => b.x === x && b.y === y);

export const queimando = (m: MatchState, x: number, y: number): boolean =>
  m.chamas.some((c) => c.x === x && c.y === y);

/** Dá para ENTRAR nesta casa? Fogo não barra: barra a morte, que é pior. */
export function livre(m: MatchState, x: number, y: number): boolean {
  return dentro(x, y) && m.grade[indice(x, y)] === CHAO && !bombaEm(m, x, y);
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

/**
 * O que a pessoa (ou o bot) está apertando. Guardado no estado e consumido pelo
 * passo seguinte — a entrada não move ninguém sozinha, só o passo move.
 */
export function aplicarEntrada(m: MatchState, playerId: PlayerId, entrada: Entrada): MatchState {
  const j = m.jogadores.find((x) => x.id === playerId);
  if (!j || !j.vivo) return m;
  if (j.querDir === entrada.dir && (!entrada.bomba || j.querBomba)) return m;
  return {
    ...m,
    jogadores: m.jogadores.map((x) =>
      x.id === playerId ? { ...x, querDir: entrada.dir, querBomba: x.querBomba || entrada.bomba } : x,
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
      m.faseAtePasso = agora + RODADA_PASSOS;
    }
    return m;
  }

  if (m.fase === 'FIM_DA_RODADA') {
    if (agora < m.faseAtePasso) return m;
    return proximaRodadaOuFim(m);
  }

  colocarBombas(m, agora);
  mover(m);
  m.chamas = m.chamas.filter((c) => c.ateOPasso > agora);
  explodir(m, agora);
  fechar(m, agora);
  coletar(m, agora);
  matar(m, agora);
  conferirFimDaRodada(m, agora);
  return m;
}

function colocarBombas(m: MatchState, agora: number): void {
  for (const j of m.jogadores) {
    if (!j.querBomba) continue;
    j.querBomba = false;
    if (!j.vivo) continue;
    const [x, y] = casaOcupada(j);
    if (bombaEm(m, x, y)) continue;
    if (m.bombas.filter((b) => b.dono === j.id).length >= BOMBAS_POR_JOGADOR) continue;
    m.bombas.push({
      id: m.proximaBomba++,
      x,
      y,
      dono: j.id,
      alcance: j.alcance,
      colocadaNoPasso: agora,
      explodeNoPasso: agora + PAVIO_PASSOS,
    });
    m.eventos.push({ tipo: 'BOMBA', playerId: j.id });
  }
}

/**
 * Movimento casa a casa, com a sensação de controle contínuo:
 *
 * - segurando a direção, anda; soltando, termina a casa em que estava e para;
 * - inverter no meio do caminho vale na hora (é o "ops, volta" de quem viu a
 *   bomba), desde que a casa de onde saiu não tenha uma bomba;
 * - virar para o lado no meio do caminho vale ao chegar no centro da casa.
 *
 * A sobra de um passo que chega no centro continua no mesmo passo, senão a
 * velocidade dependeria de quantos centros a pessoa atravessa.
 */
function mover(m: MatchState): void {
  for (const j of m.jogadores) {
    if (!j.vivo) continue;
    let resto = velocidadeDe(j);
    let inverteu = false;

    while (resto > 0) {
      if (!j.mov) {
        const d = j.querDir;
        if (!d) break;
        j.olhando = d;
        const [dx, dy] = DELTA[d];
        if (!livre(m, j.x + dx, j.y + dy)) break;
        j.mov = { dir: d, progresso: 0 };
      } else if (!inverteu && j.querDir !== null && j.querDir === OPOSTA[j.mov.dir]) {
        inverteu = true;
        if (livre(m, j.x, j.y)) {
          const [dx, dy] = DELTA[j.mov.dir];
          j.x += dx;
          j.y += dy;
          j.mov = { dir: j.querDir, progresso: UNIDADE - j.mov.progresso };
          j.olhando = j.querDir;
        }
      }

      const anda = Math.min(resto, UNIDADE - j.mov.progresso);
      j.mov.progresso += anda;
      resto -= anda;

      if (j.mov.progresso >= UNIDADE) {
        const [dx, dy] = DELTA[j.mov.dir];
        j.x += dx;
        j.y += dy;
        j.mov = null;
        if (!j.querDir) break;
      }
    }
  }
}

function acenderChama(m: MatchState, nova: Chama): void {
  const ja = m.chamas.find((c) => c.x === nova.x && c.y === nova.y);
  if (!ja) {
    m.chamas.push(nova);
    return;
  }
  ja.ateOPasso = Math.max(ja.ateOPasso, nova.ateOPasso);
  // Dois braços se cruzando viram um centro: é o que o desenho precisa saber.
  if (ja.forma !== nova.forma) ja.forma = 'CENTRO';
  ja.ponta = ja.ponta && nova.ponta;
}

/** Explosão em cadeia: fogo que encosta numa bomba a detona no mesmo passo. */
function explodir(m: MatchState, agora: number): void {
  const fila: Bomba[] = m.bombas.filter((b) => b.explodeNoPasso <= agora || queimando(m, b.x, b.y));
  const ate = agora + FOGO_PASSOS;

  while (fila.length > 0) {
    const b = fila.shift()!;
    if (!m.bombas.includes(b)) continue;
    m.bombas = m.bombas.filter((x) => x !== b);
    m.eventos.push({ tipo: 'EXPLOSAO', x: b.x, y: b.y });
    acenderChama(m, { x: b.x, y: b.y, ateOPasso: ate, forma: 'CENTRO', ponta: false });

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
          acenderChama(m, { x, y, ateOPasso: ate, forma, ponta: true });
          break;
        }

        const outra = bombaEm(m, x, y);
        if (outra) {
          acenderChama(m, { x, y, ateOPasso: ate, forma, ponta: true });
          if (!fila.includes(outra)) fila.push(outra);
          break;
        }

        const item = m.itens.find((it) => it.x === x && it.y === y && it.visivelNoPasso <= agora);
        if (item) {
          m.itens = m.itens.filter((it) => it !== item);
          acenderChama(m, { x, y, ateOPasso: ate, forma, ponta: true });
          break;
        }

        acenderChama(m, { x, y, ateOPasso: ate, forma, ponta: k === b.alcance });
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
    m.bombas = m.bombas.filter((b) => b.x !== x || b.y !== y);
    m.itens = m.itens.filter((it) => it.x !== x || it.y !== y);
    m.chamas = m.chamas.filter((c) => c.x !== x || c.y !== y);
    m.eventos.push({ tipo: 'FECHOU', x, y });
    // Quem está na casa, ou entrando nela, é esmagado; quem estava saindo
    // dela é empurrado para a casa de destino.
    for (const j of m.jogadores) {
      if (!j.vivo) continue;
      const [ox, oy] = casaOcupada(j);
      if (ox === x && oy === y) {
        j.vivo = false;
        j.morreuNoPasso = agora;
        j.mov = null;
        j.querDir = null;
        m.eventos.push({ tipo: 'MORTE', playerId: j.id });
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
    if (item.tipo === 'FOGO') j.alcance = Math.min(ALCANCE_MAX, j.alcance + 1);
    else j.velocidade = Math.min(VELOCIDADE_MAX_NIVEL, j.velocidade + 1);
    m.eventos.push({ tipo: 'PEGOU', playerId: j.id, item: item.tipo });
  }
}

function matar(m: MatchState, agora: number): void {
  for (const j of m.jogadores) {
    if (!j.vivo) continue;
    const [x, y] = casaOcupada(j);
    if (!queimando(m, x, y)) continue;
    j.vivo = false;
    j.morreuNoPasso = agora;
    j.mov = null;
    j.querDir = null;
    m.eventos.push({ tipo: 'MORTE', playerId: j.id });
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
