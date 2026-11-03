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

/** Só os dois melhoramentos da primeira versão: alcance do fogo e velocidade. */
export type TipoItem = 'FOGO' | 'VELOCIDADE';
export const TIPOS_DE_ITEM: readonly TipoItem[] = ['FOGO', 'VELOCIDADE'];

export type Fase = 'CONTAGEM' | 'JOGANDO' | 'FIM_DA_RODADA';

export interface MatchOptions {
  /** Rodadas que alguém precisa vencer para levar a partida. */
  vitorias: number;
}

export interface Movimento {
  dir: Dir;
  /** De 0 a `UNIDADE`: quanto do caminho até a casa vizinha já foi andado. */
  progresso: number;
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
  /** Apertou a bomba e o passo ainda não consumiu. */
  querBomba: boolean;
  vivo: boolean;
  morreuNoPasso: number | null;
  alcance: number;
  /** Níveis de velocidade coletados, de 0 a `VELOCIDADE_MAX_NIVEL`. */
  velocidade: number;
}

export interface Bomba {
  id: number;
  x: number;
  y: number;
  dono: PlayerId;
  alcance: number;
  colocadaNoPasso: number;
  explodeNoPasso: number;
}

/** Eixo é só para o desenho: centro, braço horizontal ou vertical, ponta. */
export interface Chama {
  x: number;
  y: number;
  ateOPasso: number;
  forma: 'CENTRO' | 'H' | 'V';
  ponta: boolean;
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
  | { tipo: 'MORTE'; playerId: PlayerId }
  | { tipo: 'PEGOU'; playerId: PlayerId; item: TipoItem }
  | { tipo: 'BOMBA'; playerId: PlayerId }
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
  /** Fim da rodada: quem venceu, ou `null` se empatou. */
  vencedorDaRodada: PlayerId | null;
  endReason: EndReason | null;
  campeao: PlayerId | null;
  eventos: Evento[];
}

export interface Entrada {
  dir: Dir | null;
  bomba: boolean;
}
