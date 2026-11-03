/**
 * O motor: um passo de cada vez.
 *
 * `passo(m)` devolve o estado seguinte, sem tocar no anterior. A ordem dentro
 * do passo é parte da regra e está escrita uma vez só, aqui:
 *
 *   1. a caveira que venceu acaba
 *   2. bombas pedidas são colocadas
 *   3. todo mundo anda (e quem tem chute empurra a bomba em que esbarra)
 *   4. bombas chutadas escorregam
 *   5. o fogo que já durou o bastante se apaga
 *   6. bombas vencidas (e as atingidas por fogo) explodem, em cadeia
 *   7. a arena fecha mais um bloco, se for a hora
 *   8. quem está sobre um item o pega; a caveira passa de um para outro
 *   9. quem está sobre fogo morre, e os itens dele se espalham pela arena
 *  10. a rodada acaba se sobrou um (ou ninguém), ou se a arena fechou toda
 *
 * Morrer DEPOIS de explodir e no mesmo passo para todos é o que faz duas
 * bombas que pegam dois jogadores ao mesmo tempo darem empate, e não vitória
 * de quem estava primeiro na lista.
 */

import {
  ALCANCE_INICIAL,
  ALCANCE_MAX,
  BOMBAS_INICIAIS,
  BOMBAS_MAX,
  CONTAGEM_PASSOS,
  DESLIZE_POR_PASSO,
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
  UNIDADE,
  VELOCIDADE_BASE,
  VELOCIDADE_LENTA,
  VELOCIDADE_MAX_NIVEL,
  VELOCIDADE_POR_NIVEL,
  fechamentoEmPassos,
} from './constantes.js';
import { ESPIRAL } from './fechamento.js';
import { DELTA, dentro, gerarArena, indice, NASCEDOUROS, OPOSTA } from './mapa.js';
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
      maldicao: null,
      imuneAte: 0,
    };
  });
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

export const velocidadeDe = (j: JogadorNoJogo): number =>
  j.maldicao?.tipo === 'LENTO' ? VELOCIDADE_LENTA : VELOCIDADE_BASE + j.velocidade * VELOCIDADE_POR_NIVEL;

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
  colocarBombas(m, agora);
  mover(m);
  deslizar(m);
  m.chamas = m.chamas.filter((c) => c.ateOPasso > agora);
  explodir(m, agora);
  fechar(m, agora);
  coletar(m, agora);
  passarCaveira(m, agora);
  matar(m, agora);
  conferirFimDaRodada(m, agora);
  return m;
}

function colocarBombas(m: MatchState, agora: number): void {
  for (const j of m.jogadores) {
    if (!j.querBomba) continue;
    j.querBomba = false;
    if (!j.vivo || j.maldicao?.tipo === 'SEM_BOMBA') continue;
    const [x, y] = casaOcupada(j);
    if (bombaEm(m, x, y)) continue;
    if (m.bombas.filter((b) => b.dono === j.id).length >= j.bombas) continue;
    m.bombas.push({
      id: m.proximaBomba++,
      x,
      y,
      dono: j.id,
      alcance: j.alcance,
      colocadaNoPasso: agora,
      explodeNoPasso: agora + PAVIO_PASSOS,
      deslize: null,
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
/** A direção que vale: a caveira de direcional invertido troca cada uma pela oposta. */
const direcaoDe = (j: JogadorNoJogo): Dir | null =>
  j.querDir !== null && j.maldicao?.tipo === 'INVERTIDO' ? OPOSTA[j.querDir] : j.querDir;

function mover(m: MatchState): void {
  for (const j of m.jogadores) {
    if (!j.vivo) continue;
    let resto = velocidadeDe(j);
    let inverteu = false;
    const quer = direcaoDe(j);

    while (resto > 0) {
      if (!j.mov) {
        const d = quer;
        if (!d) break;
        j.olhando = d;
        const [dx, dy] = DELTA[d];
        if (!livre(m, j.x + dx, j.y + dy)) {
          if (j.chute) chutar(m, j, d);
          break;
        }
        j.mov = { dir: d, progresso: 0 };
      } else if (!inverteu && quer !== null && quer === OPOSTA[j.mov.dir]) {
        inverteu = true;
        if (livre(m, j.x, j.y)) {
          const [dx, dy] = DELTA[j.mov.dir];
          j.x += dx;
          j.y += dy;
          j.mov = { dir: quer, progresso: UNIDADE - j.mov.progresso };
          j.olhando = quer;
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
        // Quem deu meia-volta para no centro da casa a que voltou, sem levar a
        // sobra adiante: voltar é "voltar para ESTA casa". Levando a sobra, o
        // bot que voltava para virar de lado passava do ponto, voltava de
        // novo e ficava tremendo no lugar. Para a pessoa é um passo só.
        if (!quer || inverteu) break;
      }
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
  const fila: Bomba[] = m.bombas.filter((b) => b.explodeNoPasso <= agora || queimando(m, b.x, b.y));
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
  for (const j of m.jogadores) {
    if (!j.vivo) continue;
    const [x, y] = casaOcupada(j);
    const chama = m.chamas.find((c) => c.x === x && c.y === y);
    if (!chama) continue;
    // O autor é o dono de outro fogo que chegou ali; só a própria bomba é suicídio.
    const autor = chama.donos.find((d) => d !== j.id) ?? (chama.donos.includes(j.id) ? j.id : null);
    const ajudantes = chama.donos.filter((d) => d !== autor && d !== j.id);
    morrer(m, j, agora, autor, ajudantes, 'FOGO');
  }
}

function morrer(
  m: MatchState,
  j: JogadorNoJogo,
  agora: number,
  autor: PlayerId | null,
  ajudantes: PlayerId[],
  causa: 'FOGO' | 'FECHAMENTO',
): void {
  j.vivo = false;
  j.morreuNoPasso = agora;
  j.mov = null;
  j.querDir = null;
  m.abates.push({ rodada: m.rodada, passo: agora, vitima: j.id, autor, ajudantes, causa });
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
  if (j.maldicao) devolver.push('CAVEIRA');
  j.alcance = ALCANCE_INICIAL;
  j.velocidade = 0;
  j.bombas = BOMBAS_INICIAIS;
  j.chute = false;
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
