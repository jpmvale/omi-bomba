/**
 * Tipos do motor do OmiBomba.
 *
 * O motor é puro e determinístico: o tempo é contado em PASSOS (`TICK_MS`
 * cada), nunca em relógio de parede, e a única aleatoriedade — o sorteio das
 * caixas e dos itens escondidos — sai de uma semente que entra por parâmetro.
 * É o que deixa simular mil rodadas num teste em poucos segundos.
 *
 * Posição é inteira: a casa é dividida em `UNIDADE` partes. Nada de `float` no
 * estado — duas máquinas repetindo os mesmos passos chegam ao mesmo lugar.
 */

export type PlayerId = string;

export type Dir = 'CIMA' | 'BAIXO' | 'ESQUERDA' | 'DIREITA';
export const DIRECOES: readonly Dir[] = ['CIMA', 'BAIXO', 'ESQUERDA', 'DIREITA'];

/** 0 chão, 1 parede (fixa), 2 caixa (quebra com o fogo). */
export type Celula = 0 | 1 | 2;
export const CHAO: Celula = 0;
export const PAREDE: Celula = 1;
export const CAIXA: Celula = 2;

/**
 * Fogo (alcance), velocidade, bomba (uma a mais por vez), chute (empurra
 * bomba), luva (carrega e arremessa bomba) e caveira — que não é melhoria: é
 * uma maldição que passa adiante.
 */
export type TipoItem = 'FOGO' | 'VELOCIDADE' | 'BOMBA' | 'CHUTE' | 'LUVA' | 'CAVEIRA';
export const TIPOS_DE_ITEM: readonly TipoItem[] = ['FOGO', 'VELOCIDADE', 'BOMBA', 'CHUTE', 'LUVA', 'CAVEIRA'];

/** O que a caveira faz: inverte o direcional, impede a bomba ou deixa lento. */
export type Maldicao = 'INVERTIDO' | 'SEM_BOMBA' | 'LENTO';
export const MALDICOES: readonly Maldicao[] = ['INVERTIDO', 'SEM_BOMBA', 'LENTO'];

export type Fase = 'CONTAGEM' | 'JOGANDO' | 'FIM_DA_RODADA';

export interface MatchOptions {
  /** Rodadas que alguém precisa vencer para levar a partida. */
  vitorias: number;
  /** Minutos de rodada até a arena começar a fechar: 1, 3 ou 5. */
  fechamento: number;
}

export interface Movimento {
  dir: Dir;
  /** De 0 a `UNIDADE`: quanto do caminho até a casa vizinha já foi andado. */
  progresso: number;
}

/**
 * Quem morreu volta como fantasma na borda da arena: anda pelo `ANEL` (as
 * casas de parede em volta) e arremessa bomba para dentro.
 */
export interface Fantasma {
  /** Índice no `ANEL` da casa de onde saiu (ou onde está parado). */
  anel: number;
  /** +1 é o sentido horário do anel; `segurando` é a tecla que começou o trecho. */
  mov: { sentido: 1 | -1; progresso: number; segurando: Dir } | null;
}

export interface JogadorNoJogo {
  id: PlayerId;
  /** A casa de onde saiu (ou onde está parado). */
  x: number;
  y: number;
  mov: Movimento | null;
  olhando: Dir;
  /** Direção segurada agora. `null` = soltou. */
  querDir: Dir | null;
  /**
   * A última direção apertada, guardada por alguns passos mesmo depois de
   * solta: o toque rápido entre dois passos do servidor (ou a curva pedida
   * antes da esquina) não se perde. Só a entrada de gente usa.
   */
  toque: { dir: Dir; ate: number } | null;
  /** Apertou a bomba e o passo ainda não consumiu. */
  querBomba: boolean;
  vivo: boolean;
  morreuNoPasso: number | null;
  alcance: number;
  /** Níveis de velocidade coletados, de 0 a `VELOCIDADE_MAX_NIVEL`. */
  velocidade: number;
  /** Quantas bombas pode ter armadas ao mesmo tempo. */
  bombas: number;
  /** Pegou o chute: andar contra uma bomba a empurra. */
  chute: boolean;
  /** Pegou a luva: o botão de ação diante de uma bomba a levanta, e de novo a arremessa. */
  luva: boolean;
  /** A caveira, enquanto dura. */
  maldicao: { tipo: Maldicao; atePasso: number } | null;
  /** Acabou de passar a caveira: não a recebe de volta até este passo. */
  imuneAte: number;
  /** Morto: a borda por onde anda. `null` vivo, ou nos primeiros instantes da morte. */
  fantasma: Fantasma | null;
  /** Voltou da borda nesta rodada (matou alguém como fantasma). */
  voltou: boolean;
  /** Fogo não mata até este passo: quem acabou de voltar nasce dentro da explosão. */
  protegidoAte: number;
  /** Número da última entrada aplicada, e o passo em que chegou: é com isto que o cliente se acerta com o servidor. */
  entradaSeq: number;
  entradaPasso: number;
}

export interface Bomba {
  id: number;
  x: number;
  y: number;
  dono: PlayerId;
  alcance: number;
  colocadaNoPasso: number;
  explodeNoPasso: number;
  /** Chutada: escorrega nesta direção até bater em alguma coisa. */
  deslize: Movimento | null;
  /** Levantada com a luva: viaja com quem a carrega, com o pavio parado. */
  carregadaPor: PlayerId | null;
  /** Arremessada: está no ar, a caminho de (x, y), com o pavio parado. */
  voo: Voo | null;
}

/** Bomba no ar: saiu de (deX, deY) e anda `casas` casas na direção `dir`, dando a volta na arena se passar da borda. */
export interface Voo {
  dir: Dir;
  deX: number;
  deY: number;
  casas: number;
  /** De 0 a `casas * UNIDADE`. */
  progresso: number;
}

/** Eixo é só para o desenho: centro, braço horizontal ou vertical, ponta. */
export interface Chama {
  x: number;
  y: number;
  ateOPasso: number;
  forma: 'CENTRO' | 'H' | 'V';
  ponta: boolean;
  /** Donos das bombas cujo fogo chegou aqui: é como se sabe quem matou quem. */
  donos: PlayerId[];
}

/** Uma eliminação, para o log da rodada e o KDA do fim da partida. */
export interface Abate {
  rodada: number;
  passo: number;
  vitima: PlayerId;
  /** Dono do fogo que matou (a própria vítima, se foi a bomba dela); `null` na arena fechando. */
  autor: PlayerId | null;
  /** Outros donos de fogo que estavam na mesma casa: a assistência. */
  ajudantes: PlayerId[];
  causa: 'FOGO' | 'FECHAMENTO';
  /** O autor era fantasma e, por este abate, voltou para a arena. */
  voltou: boolean;
}

export interface Item {
  x: number;
  y: number;
  tipo: TipoItem;
  /**
   * Item que acabou de sair de uma caixa fica protegido enquanto o fogo que o
   * revelou ainda queima — senão a própria explosão que abriu a caixa o
   * destruiria no mesmo instante, e nenhum item sobreviveria.
   */
  visivelNoPasso: number;
}

/** O que aconteceu neste passo, para o cliente tocar efeito. */
export type Evento =
  | { tipo: 'EXPLOSAO'; x: number; y: number }
  | { tipo: 'MORTE'; playerId: PlayerId; autor: PlayerId | null }
  | { tipo: 'CHUTE'; playerId: PlayerId }
  | { tipo: 'MALDICAO'; playerId: PlayerId; maldicao: Maldicao; de: PlayerId | null }
  | { tipo: 'PEGOU'; playerId: PlayerId; item: TipoItem }
  | { tipo: 'BOMBA'; playerId: PlayerId }
  | { tipo: 'LEVANTOU'; playerId: PlayerId }
  | { tipo: 'ARREMESSO'; playerId: PlayerId }
  | { tipo: 'VOLTOU'; playerId: PlayerId }
  | { tipo: 'FECHOU'; x: number; y: number };

export type EndReason = 'VITORIA' | 'ENCERRADA_PELO_HOST';

export interface MatchState {
  id: string;
  seed: string;
  options: MatchOptions;
  playerOrder: PlayerId[];
  passo: number;
  rodada: number;
  fase: Fase;
  /** Até quando a fase atual dura (contagem e fim da rodada); fim do tempo na fase de jogo. */
  faseAtePasso: number;
  /** Passo em que a arena começa a fechar nesta rodada. */
  fechaNoPasso: number;
  /** Quantas casas da `ESPIRAL` já fecharam. */
  fechadas: number;
  /** Linha a linha, `LARGURA * ALTURA` células. */
  grade: Celula[];
  /** Sobe sempre que a grade muda: o servidor só reenvia a grade quando ela muda. */
  gradeVersao: number;
  jogadores: JogadorNoJogo[];
  bombas: Bomba[];
  chamas: Chama[];
  itens: Item[];
  /** Índice da célula → item escondido dentro da caixa. Nunca sai do servidor. */
  ocultos: Record<number, TipoItem>;
  proximaBomba: number;
  placar: Record<PlayerId, number>;
  /** Quem matou quem, na partida inteira. */
  abates: Abate[];
  /** Fim da rodada: quem venceu, ou `null` se empatou. */
  vencedorDaRodada: PlayerId | null;
  endReason: EndReason | null;
  campeao: PlayerId | null;
  eventos: Evento[];
}

export interface Entrada {
  dir: Dir | null;
  /** O botão de ação: solta bomba, levanta (com a luva) ou arremessa. */
  bomba: boolean;
  /** Número da entrada, crescente, mandado pelo cliente. */
  seq?: number;
}
