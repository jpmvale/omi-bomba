import { useRef } from 'react';
import type { Dir } from '@omi-bomba/rules';

/**
 * Controle de toque: um direcional e o botão da bomba.
 *
 * O direcional é uma área só, e não quatro botões: o dedo arrasta de uma
 * direção para outra sem levantar, e a direção é o eixo dominante entre o
 * centro e o dedo. Com quatro botões separados, deslizar do ← para o ↑
 * soltava o primeiro sem apertar o segundo.
 */
export function Controles({ aoDirecionar, aoBomba }: { aoDirecionar: (d: Dir | null) => void; aoBomba: () => void }) {
  const area = useRef<HTMLDivElement>(null);
  const ultima = useRef<Dir | null>(null);

  const direcao = (e: React.PointerEvent): Dir | null => {
    const r = area.current!.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    if (Math.hypot(dx, dy) < r.width * 0.12) return null;
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'DIREITA' : 'ESQUERDA';
    return dy > 0 ? 'BAIXO' : 'CIMA';
  };

  const mudar = (d: Dir | null) => {
    if (d === ultima.current) return;
    ultima.current = d;
    aoDirecionar(d);
  };

  return (
    <div className="controles">
      <div
        ref={area}
        className="direcional"
        aria-label="Direcional"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); mudar(direcao(e)); }}
        onPointerMove={(e) => { if (e.buttons > 0 || e.pointerType === 'touch') mudar(direcao(e)); }}
        onPointerUp={() => mudar(null)}
        onPointerCancel={() => mudar(null)}
        onLostPointerCapture={() => mudar(null)}
      >
        <span className="seta seta--cima">▲</span>
        <span className="seta seta--baixo">▼</span>
        <span className="seta seta--esquerda">◀</span>
        <span className="seta seta--direita">▶</span>
      </div>
      <button
        className="botao-bomba"
        aria-label="Soltar bomba"
        onPointerDown={(e) => { e.preventDefault(); aoBomba(); }}
      >
        💣
      </button>
    </div>
  );
}
