export * from './types.js';
export * from './constantes.js';
export { DELTA, OPOSTA, NASCEDOUROS, dentro, eParedeFixa, gerarArena, indice, zonaSegura } from './mapa.js';
export {
  aplicarEntrada,
  bombaEm,
  casaOcupada,
  createMatch,
  endMatch,
  fechadasEm,
  livre,
  passo,
  queimando,
  velocidadeDe,
  type CreateMatchParams,
} from './engine.js';
export { project, type JogadorVisto, type MatchView } from './projection.js';
export { createRng, type Rng } from './rng.js';
export { conferirInvariantes } from './invariants.js';
export { ESPIRAL } from './fechamento.js';
