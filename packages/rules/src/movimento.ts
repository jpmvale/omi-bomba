/**
 * Como um corpo anda pela grade — a regra inteira, num lugar só.
 *
 * Mora fora do `engine` porque o cliente também a roda: para o próprio boneco
 * responder na hora em que a tecla desce, o navegador anda com ele por conta
 * própria e depois se acerta com o servidor (`app/src/jogo/previsao.ts`). Se
 * as duas pontas andassem por regras diferentes, o acerto viraria tranco.
 *
 * - segurando a direção, anda; soltando, termina a casa em que estava e para;
 * - inverter no meio do caminho vale na hora (é o "ops, volta" de quem viu a
 *   bomba), desde que a casa de onde saiu não tenha uma bomba;
 * - virar para o lado no meio do caminho vale ao chegar no centro da casa;
 * - o toque (a última direção apertada) vale por `TOQUE_PASSOS` mesmo depois
 *   de solto: o toque rápido não se perde entre dois passos, e a curva pedida
 *   um pouco antes da esquina é feita nela.
 *
 * A sobra de um passo que chega no centro continua no mesmo passo, senão a
 * velocidade dependeria de quantos centros a pessoa atravessa.
 */

import { UNIDADE, VELOCIDADE_BASE, VELOCIDADE_LENTA, VELOCIDADE_POR_NIVEL } from './constantes.js';
import { DELTA, OPOSTA } from './mapa.js';
import type { Dir, JogadorNoJogo } from './types.js';

/** O que o movimento lê e escreve de um jogador. */
export type Andante = Pick<JogadorNoJogo, 'x' | 'y' | 'mov' | 'olhando' | 'querDir' | 'toque' | 'maldicao' | 'velocidade'>;

export const velocidadeDe = (j: Pick<JogadorNoJogo, 'maldicao' | 'velocidade'>): number =>
  j.maldicao?.tipo === 'LENTO' ? VELOCIDADE_LENTA : VELOCIDADE_BASE + j.velocidade * VELOCIDADE_POR_NIVEL;

/**
 * Um passo de caminhada. `livre` diz se dá para entrar numa casa; `esbarrou`
 * é chamado quando a pessoa quer andar e a casa à frente está ocupada (é
 * onde o motor chuta a bomba).
 */
export function moverJogador(
  j: Andante,
  agora: number,
  livre: (x: number, y: number) => boolean,
  esbarrou?: (d: Dir) => void,
): void {
  // A caveira de direcional invertido troca cada direção pela oposta.
  const inv = (d: Dir | null): Dir | null => (d !== null && j.maldicao?.tipo === 'INVERTIDO' ? OPOSTA[d] : d);
  if (j.toque && j.toque.ate < agora) j.toque = null;
  const segurada = inv(j.querDir);
  let tocada = inv(j.toque?.dir ?? null);
  const usarToque = (d: Dir): void => {
    if (d === tocada) {
      j.toque = null;
      tocada = null;
    }
  };

  let resto = velocidadeDe(j);
  let inverteu = false;

  while (resto > 0) {
    if (!j.mov) {
      // Parado no centro: o toque pedido vale antes da tecla segurada (é a
      // curva que a pessoa pediu); se ele não tem saída, vale a segurada.
      const opcoes = [tocada, segurada].filter((d): d is Dir => d !== null);
      const d = opcoes.find((o) => {
        const [dx, dy] = DELTA[o];
        return livre(j.x + dx, j.y + dy);
      });
      if (!d) {
        const frente = segurada ?? tocada;
        if (frente) {
          j.olhando = frente;
          esbarrou?.(frente);
        }
        break;
      }
      usarToque(d);
      j.olhando = d;
      j.mov = { dir: d, progresso: 0 };
    } else if (!inverteu) {
      const volta = OPOSTA[j.mov.dir];
      if (segurada === volta || tocada === volta) {
        inverteu = true;
        if (livre(j.x, j.y)) {
          usarToque(volta);
          const [dx, dy] = DELTA[j.mov.dir];
          j.x += dx;
          j.y += dy;
          j.mov = { dir: volta, progresso: UNIDADE - j.mov.progresso };
          j.olhando = volta;
        }
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
      if ((segurada === null && tocada === null) || inverteu) break;
    }
  }
}
