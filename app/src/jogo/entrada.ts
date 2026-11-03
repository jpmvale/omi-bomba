/**
 * Teclado → comando de jogo.
 *
 * Manda só quando MUDA (apertou, soltou, bomba). A direção valendo é a da
 * última tecla apertada que ainda está segurada: segurar ← e, sem soltar,
 * apertar ↑ vira para cima; soltar ↑ volta para a esquerda. É o que os dedos
 * esperam de um jogo de grade.
 */

import type { Dir } from '@omi-bomba/rules';

const TECLAS: Record<string, Dir> = {
  ArrowUp: 'CIMA', KeyW: 'CIMA',
  ArrowDown: 'BAIXO', KeyS: 'BAIXO',
  ArrowLeft: 'ESQUERDA', KeyA: 'ESQUERDA',
  ArrowRight: 'DIREITA', KeyD: 'DIREITA',
};
const BOMBA = new Set(['Space', 'Enter', 'KeyX', 'KeyK']);

export type EnviarEntrada = (dir: Dir | null, bomba: boolean) => void;

export interface Controle {
  /** Direção vinda do toque. `null` = soltou. */
  toque(dir: Dir | null): void;
  bomba(): void;
  desligar(): void;
}

export function ligarControles(enviar: EnviarEntrada): Controle {
  const seguradas: Dir[] = [];
  let doToque: Dir | null = null;
  let ultima: Dir | null = null;

  const valendo = (): Dir | null => doToque ?? seguradas.at(-1) ?? null;
  const conferir = () => {
    const d = valendo();
    if (d !== ultima) {
      ultima = d;
      enviar(d, false);
    }
  };

  const desce = (e: KeyboardEvent) => {
    // Digitando no chat, a seta é do texto.
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const d = TECLAS[e.code];
    if (d) {
      e.preventDefault();
      if (!seguradas.includes(d)) seguradas.push(d);
      conferir();
      return;
    }
    if (BOMBA.has(e.code)) {
      e.preventDefault();
      if (!e.repeat) enviar(valendo(), true);
    }
  };

  const sobe = (e: KeyboardEvent) => {
    const d = TECLAS[e.code];
    if (!d) return;
    const i = seguradas.indexOf(d);
    if (i >= 0) seguradas.splice(i, 1);
    conferir();
  };

  // Trocou de janela com a tecla apertada: o `keyup` nunca vem.
  const perdeuFoco = () => {
    seguradas.length = 0;
    doToque = null;
    conferir();
  };

  window.addEventListener('keydown', desce);
  window.addEventListener('keyup', sobe);
  window.addEventListener('blur', perdeuFoco);

  return {
    toque(dir) {
      doToque = dir;
      conferir();
    },
    bomba() {
      enviar(valendo(), true);
    },
    desligar() {
      window.removeEventListener('keydown', desce);
      window.removeEventListener('keyup', sobe);
      window.removeEventListener('blur', perdeuFoco);
    },
  };
}
