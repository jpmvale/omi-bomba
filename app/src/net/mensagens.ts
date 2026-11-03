/** Erro de servidor em português de gente. Erro genérico em jogo é frustração pura. */
const FRASES: Record<string, string> = {
  FALTA_PRONTO: 'Falta alguém dar pronto.',
  JOGADORES_INSUFICIENTES: 'Precisa de pelo menos 2 na arena.',
  SO_BOTS_NA_ARENA: 'Precisa de pelo menos uma pessoa na arena.',
  ARENA_CHEIA: 'A arena está cheia (5 lugares).',
  SALA_LOTADA: 'A sala está lotada.',
  BOTS_DEMAIS: 'Já tem bot demais na arena.',
  SILENCIADO: 'O anfitrião silenciou você no chat.',
  RAPIDO_DEMAIS: 'Devagar com o chat.',
  APELIDO_TOMADO: 'Esse apelido já está na sala.',
  PERSONAGEM_TOMADO: 'Esse personagem já é de alguém na arena.',
  SALAS_DEMAIS: 'Muitas salas criadas daqui. Tente mais tarde.',
  ROOM_NOT_FOUND: 'Essa sala não existe mais.',
  RATE_LIMITED: 'Muitos comandos seguidos. Respire um pouco.',
  VALIDATION_FAILED: 'Algo não bateu. Tente de novo.',
  PROTOCOL_VERSION: 'Saiu uma versão nova do jogo. Recarregue a página.',
};

export const frase = (codigo: string): string => FRASES[codigo] ?? 'Não deu certo. Tente de novo.';
