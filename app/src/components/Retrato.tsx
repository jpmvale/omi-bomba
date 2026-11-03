import { useEffect, useRef } from 'react';
import type { Personagem } from '@omi-bomba/protocol';
import { desenharPersonagem } from '../jogo/personagens';

/** O personagem parado, de frente. Usado no lobby, no placar e no chat. */
export function Retrato({ personagem, tamanho = 36, apagado = false }: { personagem: Personagem; tamanho?: number; apagado?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(tamanho * dpr);
    c.height = Math.round(tamanho * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, tamanho, tamanho);
    desenharPersonagem(ctx, personagem, tamanho / 2, tamanho / 2 + tamanho * 0.04, tamanho * 1.05, 'BAIXO', 0, 0);
  }, [personagem, tamanho]);
  return (
    <canvas
      ref={ref}
      aria-hidden
      style={{ width: tamanho, height: tamanho, flex: `0 0 ${tamanho}px`, opacity: apagado ? 0.35 : 1, filter: apagado ? 'grayscale(1)' : undefined }}
    />
  );
}
