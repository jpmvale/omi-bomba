/**
 * Os bots do OmiBomba.
 *
 * A cada passo, o bot olha a arena e devolve a mesma coisa que uma pessoa
 * devolveria: uma direção segurada e se apertou a bomba. Ele não mexe no
 * estado nem tem atalho — entra pelo mesmo `aplicarEntrada` do humano.
 *
 * E vê só o que um humano vê. A visão aqui é um recorte do estado SEM os itens
 * escondidos nas caixas: um bot que soubesse onde estão os itens seria um bot
 * trapaceiro, e o tipo garante que ele não tem como saber.
 *
 * Prioridades, nesta ordem:
 *   1. está numa casa que vai pegar fogo → foge pelo caminho mais curto que
 *      chega a tempo numa casa segura;
 *   2. está parado num lugar onde uma bomba acerta caixa ou adversário, e há
 *      rota de fuga depois de soltá-la → solta;
 *   3. anda até o alvo mais perto (item, depois lugar bom para bomba), sem
 *      nunca pisar em casa que vai pegar fogo.
 *
 * A dificuldade muda a atenção, não as regras: o fácil demora a "notar" bomba
 * dos outros e passeia à toa; o difícil vê tudo na hora e caça gente.
 */

import {
  ALTURA,
  CAIXA,
  ESPIRAL,
  FECHAMENTO_INTERVALO_PASSOS,
  CHAO,
  DELTA,
  DIRECOES,
  LARGURA,
  OPOSTA,
  PAREDE,
  PAVIO_PASSOS,
  UNIDADE,
  indice,
  velocidadeDe,
  type Bomba,
  type Chama,
  type Dir,
  type Entrada,
  type Item,
  type JogadorNoJogo,
  type MatchState,
  type PlayerId,
  type Rng,
} from '@omi-bomba/rules';

export const BOT_DIFFICULTIES = ['FACIL', 'MEDIO', 'DIFICIL'] as const;
export type BotDifficulty = (typeof BOT_DIFFICULTIES)[number];

/** O que o bot enxerga. `ocultos` fica de fora de propósito. */
export type VisaoDoBot = Pick<
  MatchState,
  'passo' | 'fase' | 'grade' | 'jogadores' | 'bombas' | 'chamas' | 'fechaNoPasso' | 'fechadas'
> & {
  itens: Pick<Item, 'x' | 'y' | 'tipo' | 'visivelNoPasso'>[];
};

interface Perfil {
  /** Bomba alheia mais nova que isto (em passos) o bot ainda não notou. */
  reacao: number;
  /** Chance, em mil, de ignorar o alvo e dar uma volta. */
  passeio: number;
  /** Persegue adversário, e não só caixa. */
  caca: boolean;
  /** Folga, em passos, que exige entre chegar numa casa e ela pegar fogo. */
  folga: number;
}

const PERFIS: Record<BotDifficulty, Perfil> = {
  FACIL: { reacao: 10, passeio: 250, caca: false, folga: 6 },
  MEDIO: { reacao: 4, passeio: 60, caca: true, folga: 4 },
  DIFICIL: { reacao: 0, passeio: 0, caca: true, folga: 2 },
};

const NUNCA = Number.POSITIVE_INFINITY;
/** Quanto à frente (em passos) o bot olha a espiral do fechamento: 6 s. */
const OLHAR_O_FECHAMENTO = 120;
const NADA: Entrada = { dir: null, bomba: false };

export function decidirEntrada(
  visao: VisaoDoBot,
  eu: PlayerId,
  dificuldade: BotDifficulty,
  rng: Rng,
): Entrada {
  if (visao.fase !== 'JOGANDO') return NADA;
  const mim = visao.jogadores.find((j) => j.id === eu);
  if (!mim || !mim.vivo) return NADA;
  const perfil = PERFIS[dificuldade];

  const bombas = visao.bombas.filter((b) => b.dono === eu || visao.passo - b.colocadaNoPasso >= perfil.reacao);
  const perigo = mapaDePerigo(visao, bombas);
  const porCasa = Math.ceil(UNIDADE / velocidadeDe(mim));

  // Planeja a partir da casa para onde está indo: é onde vai estar parado.
  const [ox, oy] = destino(mim);
  const atraso = mim.mov ? Math.ceil((UNIDADE - mim.mov.progresso) / velocidadeDe(mim)) : 0;
  const plano = planejar(visao, mim, ox, oy, atraso, porCasa, perfil, bombas, perigo, rng);

  // O plano manda voltar para a casa de onde saiu? Só volta se o plano feito
  // DE LÁ concordar. Sem isto o bot no meio do caminho entre A e B planejava a
  // partir de B ("volta para A"), invertia, planejava a partir de A ("vai para
  // B"), invertia de novo — e ficava tremendo no lugar até alguém chegar perto
  // e mudar a conta.
  let escolha = plano;
  if (mim.mov && plano.dir === OPOSTA[mim.mov.dir]) {
    const atrasoDeVolta = Math.ceil(mim.mov.progresso / velocidadeDe(mim));
    const deLa = planejar(visao, mim, mim.x, mim.y, atrasoDeVolta, porCasa, perfil, bombas, perigo, rng);
    if (deLa.dir === mim.mov.dir) escolha = { dir: mim.mov.dir, bomba: false };
  }
  // Com o direcional invertido pela caveira, o médio e o difícil apertam ao
  // contrário para ir aonde querem; o fácil se atrapalha como gente.
  if (escolha.dir !== null && mim.maldicao?.tipo === 'INVERTIDO' && dificuldade !== 'FACIL') {
    escolha = { ...escolha, dir: OPOSTA[escolha.dir] };
  }
  return escolha;
}

/** Tem bomba sobrando, e a caveira não o impede de soltar. */
function podeSoltar(v: VisaoDoBot, mim: JogadorNoJogo): boolean {
  if (mim.maldicao?.tipo === 'SEM_BOMBA') return false;
  return v.bombas.filter((b) => b.dono === mim.id).length < mim.bombas;
}

function planejar(
  visao: VisaoDoBot,
  mim: JogadorNoJogo,
  ox: number,
  oy: number,
  atraso: number,
  porCasa: number,
  perfil: Perfil,
  bombas: readonly Bomba[],
  perigo: readonly number[],
  rng: Rng,
): Entrada {
  const eu = mim.id;
  const origem = indice(ox, oy);

  // 1. Em perigo: fugir.
  if (perigo[origem]! !== NUNCA || queimaAgora(visao.chamas, ox, oy)) {
    const fuga = rotaSegura(visao, perigo, ox, oy, atraso, porCasa, perfil.folga, bombas);
    return { dir: primeiroPasso(mim, fuga), bomba: false };
  }

  // 2. Parado num bom lugar: bomba, se dá para fugir dela.
  if (!mim.mov && podeSoltar(visao, mim)) {
    const fuga = fugaDaBomba(visao, mim, ox, oy, perfil, bombas, porCasa);
    if (fuga !== null) return { dir: fuga[0]!, bomba: true };
  }

  // 3. Andar até um alvo, só por casas seguras.
  if (perfil.passeio > 0 && rng.nextInt(1000) < perfil.passeio) {
    const vizinhas = vizinhasSeguras(visao, perigo, ox, oy);
    if (vizinhas.length > 0) return { dir: vizinhas[rng.nextInt(vizinhas.length)]!, bomba: false };
  }

  const rota = rotaAoAlvo(visao, perigo, mim, ox, oy, perfil, bombas, porCasa);
  if (rota !== null && rota.length > 0) return { dir: primeiroPasso(mim, rota), bomba: false };
  // Rota vazia = a casa de destino JÁ é o alvo: solta a direção e para nela.
  // Antes caía no passeio ao acaso logo abaixo, e o bot que chegava andando ao
  // lugar da bomba (onde só se solta bomba parado) dava meia-volta, passava do
  // ponto e voltava — o tremor sem sair do lugar do modo difícil.
  if (rota !== null) return NADA;

  // Sem alvo: dar uma volta de vez em quando. Dois bots iguais sem nada a fazer
  // ficariam parados um diante do outro até o fim do tempo — o acaso desempata.
  if (rng.nextInt(1000) < 300) {
    const vizinhas = vizinhasSeguras(visao, perigo, ox, oy);
    if (vizinhas.length > 0) return { dir: vizinhas[rng.nextInt(vizinhas.length)]!, bomba: false };
  }
  return NADA;
}

// ---------------------------------------------------------------------------
// Leitura da arena
// ---------------------------------------------------------------------------

function destino(j: JogadorNoJogo): [number, number] {
  if (!j.mov) return [j.x, j.y];
  const [dx, dy] = DELTA[j.mov.dir];
  return [j.x + dx, j.y + dy];
}

const dentro = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < LARGURA && y < ALTURA;

function andavel(v: VisaoDoBot, x: number, y: number, bombas: readonly Bomba[] = v.bombas): boolean {
  if (!dentro(x, y) || v.grade[indice(x, y)] !== CHAO) return false;
  return !bombas.some((b) => b.x === x && b.y === y);
}

const queimaAgora = (chamas: readonly Chama[], x: number, y: number): boolean =>
  chamas.some((c) => c.x === x && c.y === y);

/** As casas que uma bomba alcança, do mesmo jeito que o motor propaga o fogo. */
function alcanceDa(v: VisaoDoBot, b: Bomba, bombas: readonly Bomba[]): number[] {
  const casas = [indice(b.x, b.y)];
  for (const d of DIRECOES) {
    const [dx, dy] = DELTA[d];
    for (let k = 1; k <= b.alcance; k++) {
      const x = b.x + dx * k;
      const y = b.y + dy * k;
      if (!dentro(x, y)) break;
      const c = v.grade[indice(x, y)];
      if (c === PAREDE) break;
      casas.push(indice(x, y));
      if (c === CAIXA || bombas.some((o) => o !== b && o.x === x && o.y === y)) break;
    }
  }
  return casas;
}

/**
 * Para cada casa, o passo em que ela vai pegar fogo (`NUNCA` se nenhuma bomba
 * conhecida a alcança). A cadeia entra: bomba atingida por outra explode junto
 * com a primeira, e não no próprio pavio.
 */
function mapaDePerigo(v: VisaoDoBot, conhecidas: readonly Bomba[]): number[] {
  // Bomba chutada é perigo onde ela vai PARAR, não onde está agora.
  const bombas = conhecidas.map((b) => (b.deslize ? ondePara(v, b, conhecidas) : b));
  const quando = new Map<Bomba, number>(bombas.map((b) => [b, b.explodeNoPasso]));
  const alcances = new Map<Bomba, number[]>(bombas.map((b) => [b, alcanceDa(v, b, bombas)]));

  for (let mudou = true; mudou;) {
    mudou = false;
    for (const a of bombas) {
      const ta = quando.get(a)!;
      for (const b of bombas) {
        if (a === b || quando.get(b)! <= ta) continue;
        if (alcances.get(a)!.includes(indice(b.x, b.y))) {
          quando.set(b, ta);
          mudou = true;
        }
      }
    }
  }

  const perigo = new Array<number>(LARGURA * ALTURA).fill(NUNCA);
  for (const b of bombas) {
    const t = quando.get(b)!;
    for (const i of alcances.get(b)!) perigo[i] = Math.min(perigo[i]!, t);
  }
  for (const c of v.chamas) perigo[indice(c.x, c.y)] = Math.min(perigo[indice(c.x, c.y)]!, v.passo);

  // A parede que vem vindo é perigo como qualquer fogo, só que anunciado.
  for (let k = v.fechadas; k < ESPIRAL.length; k++) {
    const quando = v.fechaNoPasso + k * FECHAMENTO_INTERVALO_PASSOS;
    if (quando > v.passo + OLHAR_O_FECHAMENTO) break;
    const i = ESPIRAL[k]!;
    perigo[i] = Math.min(perigo[i]!, quando);
  }
  return perigo;
}

/** Onde uma bomba escorregando vai parar: na casa antes do primeiro obstáculo. */
function ondePara(v: VisaoDoBot, b: Bomba, bombas: readonly Bomba[]): Bomba {
  const [dx, dy] = DELTA[b.deslize!.dir];
  let x = b.x;
  let y = b.y;
  const ocupada = (cx: number, cy: number): boolean =>
    v.itens.some((i) => i.x === cx && i.y === cy) ||
    v.jogadores.some((j) => j.vivo && destino(j)[0] === cx && destino(j)[1] === cy);
  while (andavel(v, x + dx, y + dy, bombas) && !ocupada(x + dx, y + dy)) {
    x += dx;
    y += dy;
  }
  return { ...b, x, y };
}

// ---------------------------------------------------------------------------
// Caminhos
// ---------------------------------------------------------------------------

interface No {
  x: number;
  y: number;
  dist: number;
  primeiro: Dir[];
}

/**
 * Busca em largura que só atravessa casa onde se chega ANTES do fogo, com
 * folga. Devolve a rota até a primeira casa que nunca pega fogo.
 */
function rotaSegura(
  v: VisaoDoBot,
  perigo: readonly number[],
  ox: number,
  oy: number,
  atraso: number,
  porCasa: number,
  folga: number,
  bombas: readonly Bomba[],
): Dir[] | null {
  const visto = new Set<number>([indice(ox, oy)]);
  const fila: No[] = [{ x: ox, y: oy, dist: 0, primeiro: [] }];
  // Sem casa segura para sempre (a arena fechando no fim), vale a que demora
  // mais a pegar fogo: ganhar tempo é ganhar a chance de o outro cair antes.
  //
  // Casa com outro jogador vale menos: sem isso todos correm para a última casa
  // da espiral, chegam juntos e morrem no mesmo passo — empate certo. Quem
  // chega depois procura a segunda melhor e cai antes, e a rodada tem vencedor.
  const ocupadas = new Set(v.jogadores.filter((j) => j.vivo).map((j) => indice(...destino(j))));
  ocupadas.delete(indice(ox, oy));
  const nota = (no: No): number => perigo[indice(no.x, no.y)]! - (ocupadas.has(indice(no.x, no.y)) ? 40 : 0);
  let melhor: No | null = null;
  while (fila.length > 0) {
    const no = fila.shift()!;
    const p = perigo[indice(no.x, no.y)]!;
    if (p === NUNCA && !queimaAgora(v.chamas, no.x, no.y)) return no.primeiro;
    if (!queimaAgora(v.chamas, no.x, no.y) && (melhor === null || nota(no) > nota(melhor))) melhor = no;
    for (const d of DIRECOES) {
      const [dx, dy] = DELTA[d];
      const x = no.x + dx;
      const y = no.y + dy;
      const i = indice(x, y);
      if (visto.has(i) || !andavel(v, x, y, bombas) || queimaAgora(v.chamas, x, y)) continue;
      const chega = v.passo + atraso + (no.dist + 1) * porCasa;
      if (perigo[i]! !== NUNCA && chega + folga >= perigo[i]!) continue;
      visto.add(i);
      fila.push({ x, y, dist: no.dist + 1, primeiro: no.primeiro.length === 0 ? [d] : no.primeiro });
    }
  }
  return melhor !== null && melhor.primeiro.length > 0 ? melhor.primeiro : null;
}

/** Uma bomba aqui acerta alguma coisa que valha? */
function valeBomba(v: VisaoDoBot, mim: JogadorNoJogo, x: number, y: number, perfil: Perfil): boolean {
  const casas = alcanceDa(v, { id: -1, x, y, dono: mim.id, alcance: mim.alcance, colocadaNoPasso: 0, explodeNoPasso: 0, deslize: null }, v.bombas);
  if (casas.some((i) => v.grade[i] === CAIXA)) return true;
  if (!perfil.caca) return false;
  return v.jogadores.some((j) => {
    if (j.id === mim.id || !j.vivo) return false;
    const [jx, jy] = destino(j);
    return casas.includes(indice(jx, jy)) || casas.includes(indice(j.x, j.y));
  });
}

/**
 * Uma bomba solta em (x, y) vale a pena E deixa saída? Devolve a rota de fuga,
 * ou `null`. As duas perguntas juntas: lugar bom de bomba sem saída é a
 * armadilha clássica do canto, onde o bot ficava parado para sempre.
 */
function fugaDaBomba(
  v: VisaoDoBot,
  mim: JogadorNoJogo,
  x: number,
  y: number,
  perfil: Perfil,
  bombas: readonly Bomba[],
  porCasa: number,
): Dir[] | null {
  if (!valeBomba(v, mim, x, y, perfil)) return null;
  const hipotese: Bomba = {
    id: -1, x, y, dono: mim.id, alcance: mim.alcance,
    colocadaNoPasso: v.passo, explodeNoPasso: v.passo + PAVIO_PASSOS, deslize: null,
  };
  const comBomba = [...bombas, hipotese];
  const fuga = rotaSegura(v, mapaDePerigo(v, comBomba), x, y, 1, porCasa, perfil.folga, comBomba);
  return fuga !== null && fuga.length > 0 ? fuga : null;
}

/** O alvo mais perto entre casas seguras: item primeiro, depois lugar de bomba. */
function rotaAoAlvo(
  v: VisaoDoBot,
  perigo: readonly number[],
  mim: JogadorNoJogo,
  ox: number,
  oy: number,
  perfil: Perfil,
  bombas: readonly Bomba[],
  porCasa: number,
): Dir[] | null {
  // A caveira não é alvo: é casa a evitar no caminho.
  const visiveis = v.itens.filter((i) => i.visivelNoPasso <= v.passo);
  const itens = new Set(visiveis.filter((i) => i.tipo !== 'CAVEIRA').map((i) => indice(i.x, i.y)));
  const caveiras = new Set(visiveis.filter((i) => i.tipo === 'CAVEIRA').map((i) => indice(i.x, i.y)));
  const tenhoBomba = !podeSoltar(v, mim);

  const visto = new Set<number>([indice(ox, oy)]);
  const fila: No[] = [{ x: ox, y: oy, dist: 0, primeiro: [] }];
  let lugarDeBomba: Dir[] | null = null;

  while (fila.length > 0) {
    const no = fila.shift()!;
    const i = indice(no.x, no.y);
    if (itens.has(i) && no.dist > 0) return no.primeiro;
    // Com bomba já armada, procurar lugar de bomba nova só faria o bot rondar
    // a própria bomba. Espera ela estourar.
    if (lugarDeBomba === null && !tenhoBomba && fugaDaBomba(v, mim, no.x, no.y, perfil, bombas, porCasa) !== null) {
      lugarDeBomba = no.primeiro;
      // Item mais longe que o lugar de bomba ainda pode ser melhor: continua
      // procurando um pouco, até o dobro da distância.
    }
    if (lugarDeBomba !== null && no.dist > Math.max(4, lugarDeBomba.length * 2)) break;
    for (const d of DIRECOES) {
      const [dx, dy] = DELTA[d];
      const x = no.x + dx;
      const y = no.y + dy;
      const j = indice(x, y);
      if (visto.has(j) || !andavel(v, x, y) || perigo[j]! !== NUNCA || caveiras.has(j)) continue;
      visto.add(j);
      fila.push({ x, y, dist: no.dist + 1, primeiro: no.primeiro.length === 0 ? [d] : no.primeiro });
    }
  }
  return lugarDeBomba;
}

function vizinhasSeguras(v: VisaoDoBot, perigo: readonly number[], x: number, y: number): Dir[] {
  return DIRECOES.filter((d) => {
    const [dx, dy] = DELTA[d];
    return andavel(v, x + dx, y + dy) && perigo[indice(x + dx, y + dy)] === NUNCA;
  });
}

/**
 * Traduz a rota (planejada a partir da casa de destino) para a direção a
 * segurar agora. Rota vazia = chegou: solta a direção e o motor termina a
 * casa e para.
 */
function primeiroPasso(_mim: JogadorNoJogo, rota: Dir[] | null): Dir | null {
  // Andando de A para B e a rota manda voltar para A: segurar a direção oposta
  // é exatamente o que inverte no motor. Os outros casos o motor resolve ao
  // chegar no centro da casa.
  return rota === null || rota.length === 0 ? null : rota[0]!;
}
