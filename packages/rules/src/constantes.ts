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

/** Começa com uma bomba por vez; cada item de bomba soma uma, até 8. */
export const BOMBAS_INICIAIS = 1;
export const BOMBAS_MAX = 8;

/** Bomba chutada anda 1 casa a cada 3 passos — mais rápido que qualquer pessoa. */
export const DESLIZE_POR_PASSO = 334;

/** A caveira dura 15 s, e lento é bem abaixo da velocidade normal. */
export const MALDICAO_PASSOS = 15 * 20;
export const VELOCIDADE_LENTA = 110;
/** Quem passou a caveira não a recebe de volta por 2 s (senão ela pingaria entre os dois). */
export const IMUNE_APOS_PASSAR = 2 * 20;

/** 2,5 s de pavio, meio segundo de fogo. */
export const PAVIO_PASSOS = 50;
export const FOGO_PASSOS = 10;

export const CONTAGEM_PASSOS = 3 * PASSOS_POR_SEGUNDO;
export const FIM_DA_RODADA_PASSOS = 4 * PASSOS_POR_SEGUNDO;
/**
 * Depois de 1, 3 ou 5 minutos (o anfitrião escolhe) a arena começa a fechar,
 * um bloco caindo a cada 0,4 s, da casa (1,1) em espiral pelas bordas até o
 * centro. As 113 casas somem em ~45 s; a rodada acaba no máximo quando a
 * última cai (todos os que sobraram morrem: empate).
 */
export const FECHAMENTO_OPCOES = [1, 3, 5] as const;
export const FECHAMENTO_INTERVALO_PASSOS = 8;
export const fechamentoEmPassos = (minutos: number): number => minutos * 60 * PASSOS_POR_SEGUNDO;

/** Fração das casas livres que nasce com caixa, e das caixas que esconde item. */
export const DENSIDADE_DE_CAIXAS = 0.7;
export const CHANCE_DE_ITEM = 0.35;

/** Peso de cada item no sorteio das caixas. O chute é o mais raro. */
export const PESO_DOS_ITENS = { FOGO: 30, BOMBA: 28, VELOCIDADE: 22, CAVEIRA: 12, CHUTE: 8 } as const;

export const MIN_JOGADORES = 2;
export const MAX_JOGADORES = 5;

export const VITORIAS_OPCOES = [1, 2, 3, 5] as const;
export const DEFAULT_OPTIONS = { vitorias: 3, fechamento: 1 };
