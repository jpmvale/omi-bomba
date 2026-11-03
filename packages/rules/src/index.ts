export * from './types.js';
export * from './constantes.js';
export {
  ANEL,
  DELTA,
  OPOSTA,
  NASCEDOUROS,
  anelEm,
  anelMaisPerto,
  dentro,
  dirNoAnel,
  eParedeFixa,
  gerarArena,
  indice,
  paraDentro,
  sentidoNoAnel,
  zonaSegura,
} from './mapa.js';
export { moverJogador, velocidadeDe, type Andante } from './movimento.js';
export {
  aplicarEntrada,
  bombaEm,
  casaDoFantasma,
  casaOcupada,
  destinoDoArremesso,
  createMatch,
  endMatch,
  fechadasEm,
  livre,
  passo,
  noChao,
  queimando,
  type CreateMatchParams,
  type MundoDoArremesso,
} from './engine.js';
export { project, type JogadorVisto, type MatchView } from './projection.js';
export { createRng, type Rng } from './rng.js';
export { conferirInvariantes } from './invariants.js';
export { ESPIRAL } from './fechamento.js';
