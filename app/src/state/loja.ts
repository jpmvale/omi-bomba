/**
 * O estado do cliente: uma loja mínima, sem biblioteca.
 *
 * O servidor manda o retrato da sala inteiro a cada mudança, então quase tudo
 * aqui é "o último retrato que chegou". O cliente nunca decide regra. Os
 * quadros da arena, que chegam 20 por segundo, ficam fora daqui: `jogo/arena.ts`.
 */

import { useSyncExternalStore } from 'react';
import type { ChatMessage, RoomView } from '@omi-bomba/protocol';
import type { EstadoConexao } from '../net/socket';

export interface Aviso {
  id: number;
  texto: string;
  tipo: 'info' | 'erro' | 'ponto';
}

export interface Estado {
  tela: 'home' | 'sala';
  eu: string | null;
  codigo: string | null;
  conexao: EstadoConexao;
  sala: RoomView | null;
  chat: ChatMessage[];
  /** Mensagens chegadas com o chat fechado. */
  naoLidas: number;
  avisos: Aviso[];
}

let estado: Estado = {
  tela: 'home',
  eu: null,
  codigo: null,
  conexao: 'CONECTADO',
  sala: null,
  chat: [],
  naoLidas: 0,
  avisos: [],
};

const ouvintes = new Set<() => void>();

export function definir(parcial: Partial<Estado>): void {
  estado = { ...estado, ...parcial };
  for (const o of ouvintes) o();
}

export const ler = (): Estado => estado;

export function useEstado(): Estado {
  return useSyncExternalStore(
    (o) => { ouvintes.add(o); return () => ouvintes.delete(o); },
    () => estado,
  );
}

let proximoAviso = 1;

function empurrar(texto: string, tipo: Aviso['tipo'], ms: number): void {
  const id = proximoAviso++;
  definir({ avisos: [...estado.avisos, { id, texto, tipo }].slice(-4) });
  setTimeout(() => definir({ avisos: estado.avisos.filter((a) => a.id !== id) }), ms);
}

export const avisar = (texto: string): void => empurrar(texto, 'info', 3_000);
export const errar = (texto: string): void => empurrar(texto, 'erro', 4_000);
export const pontuou = (texto: string): void => empurrar(texto, 'ponto', 3_200);
