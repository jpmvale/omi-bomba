/**
 * Números do jogo, num lugar só.
 *
 * Tudo em passos de `TICK_MS`. Quem quiser saber em segundos multiplica; o
 * motor nunca divide por tempo de parede.
 */

/** 20 passos por segundo. É o compasso do servidor e o ritmo dos quadros. */
export const TICK_MS = 50;
export const PASSOS_POR_SEGUNDO = 1000 / TICK_MS;

/** Grade ímpar nos dois sentidos: borda de parede e pilares nas casas pares. */
export const LARGURA = 15;
export const ALTURA = 13;

/** Uma casa tem 1000 unidades de caminho. */
export const UNIDADE = 1000;

/** 4 casas por segundo de partida; cada nível soma 0,6 casa/s, até 4 níveis. */
export const VELOCIDADE_BASE = 200;
export const VELOCIDADE_POR_NIVEL = 30;
export const VELOCIDADE_MAX_NIVEL = 4;

export const ALCANCE_INICIAL = 2;
export const ALCANCE_MAX = 8;

/**
 * Uma bomba por vez, fixo. O pedido da primeira versão foi melhorar só o fogo
 * e a velocidade; mais bombas é o próximo item natural da lista, e mudar aqui
 * é tudo que o motor precisa.
 */
export const BOMBAS_POR_JOGADOR = 1;

/** 2,5 s de pavio, meio segundo de fogo. */
export const PAVIO_PASSOS = 50;
export const FOGO_PASSOS = 10;

export const CONTAGEM_PASSOS = 3 * PASSOS_POR_SEGUNDO;
export const FIM_DA_RODADA_PASSOS = 4 * PASSOS_POR_SEGUNDO;
/** Três minutos por rodada. Sobrou mais de um vivo: empate. */
export const RODADA_PASSOS = 180 * PASSOS_POR_SEGUNDO;

/**
 * Depois de 90 s a arena começa a fechar, uma casa a cada 0,4 s. As ~100 casas
 * livres somem em uns 40 s — a rodada acaba bem antes dos três minutos, que
 * ficam só como teto.
 */
export const FECHAMENTO_APOS_PASSOS = 90 * PASSOS_POR_SEGUNDO;
export const FECHAMENTO_INTERVALO_PASSOS = 8;

/** Fração das casas livres que nasce com caixa, e das caixas que esconde item. */
export const DENSIDADE_DE_CAIXAS = 0.7;
export const CHANCE_DE_ITEM = 0.3;

export const MIN_JOGADORES = 2;
export const MAX_JOGADORES = 5;

export const VITORIAS_OPCOES = [1, 2, 3, 5] as const;
export const DEFAULT_OPTIONS = { vitorias: 3 };
