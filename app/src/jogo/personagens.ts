/**
 * Os personagens, desenhados em código.
 *
 * Nada de imagem: cada um é um corpo redondo com pés, olhos que seguem a
 * direção em que anda e um traço próprio na cabeça. Desenhar em vez de
 * carregar arquivo deixa o bundle leve, escala sem serrilhar em qualquer
 * tamanho de casa e não abre a CSP para nada.
 *
 * A cor do corpo é a identidade na arena — por isso as oito são bem
 * diferentes entre si, e o traço na cabeça ajuda quem não distingue cor.
 */

import type { Personagem } from '@omi-bomba/protocol';
import type { Dir } from '@omi-bomba/rules';

interface Visual {
  corpo: string;
  sombra: string;
  detalhe: string;
}

export const VISUAL: Record<Personagem, Visual> = {
  pavio: { corpo: '#f28c28', sombra: '#b85e10', detalhe: '#ffd66b' },
  brasa: { corpo: '#e8434f', sombra: '#a8232e', detalhe: '#ffb347' },
  faisca: { corpo: '#f5d63d', sombra: '#b89a12', detalhe: '#ffffff' },
  nevoa: { corpo: '#8fd3ff', sombra: '#4f97c4', detalhe: '#ffffff' },
  trovao: { corpo: '#9b6cf0', sombra: '#6a3fc0', detalhe: '#f5e9ff' },
  musgo: { corpo: '#55c46a', sombra: '#2f8a43', detalhe: '#b6f28a' },
  coral: { corpo: '#ff7eb6', sombra: '#c94c86', detalhe: '#fff0f7' },
  carvao: { corpo: '#59606e', sombra: '#353a45', detalhe: '#e0e4ec' },
};

export const corDoPersonagem = (p: Personagem): string => VISUAL[p].corpo;

const OLHAR: Record<Dir, [number, number]> = {
  CIMA: [0, -1],
  BAIXO: [0, 1],
  ESQUERDA: [-1, 0],
  DIREITA: [1, 0],
};

/**
 * Desenha o personagem com o centro em (cx, cy) e `t` de tamanho (a casa).
 * `anda` (0..1) balança os pés; `tempo` em ms anima o detalhe da cabeça.
 */
export function desenharPersonagem(
  ctx: CanvasRenderingContext2D,
  p: Personagem,
  cx: number,
  cy: number,
  t: number,
  olhando: Dir = 'BAIXO',
  anda = 0,
  tempo = 0,
): void {
  const v = VISUAL[p];
  const r = t * 0.34;
  const corpoY = cy + t * 0.04;

  // Sombra no chão
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + t * 0.38, r * 0.9, r * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();

  // Pés
  const passo = Math.sin(anda * Math.PI * 2) * t * 0.06;
  ctx.fillStyle = v.sombra;
  for (const lado of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + lado * r * 0.5, cy + t * 0.33 + (lado < 0 ? passo : -passo), r * 0.32, r * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Corpo
  const grad = ctx.createRadialGradient(cx - r * 0.35, corpoY - r * 0.4, r * 0.2, cx, corpoY, r * 1.1);
  grad.addColorStop(0, v.corpo);
  grad.addColorStop(1, v.sombra);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(cx, corpoY, r, r * 0.95, 0, 0, Math.PI * 2);
  ctx.fill();

  desenharDetalhe(ctx, p, v, cx, corpoY - r * 0.85, t, tempo);

  // Olhos: seguem a direção. De costas, não se veem.
  if (olhando !== 'CIMA') {
    const [ox, oy] = OLHAR[olhando];
    const olhoR = p === 'carvao' ? r * 0.26 : r * 0.21;
    for (const lado of [-1, 1]) {
      const ex = cx + lado * r * 0.36 + ox * r * 0.22;
      const ey = corpoY - r * 0.12 + oy * r * 0.1;
      if (p === 'carvao') {
        ctx.fillStyle = '#1b1f2a';
        ctx.beginPath();
        ctx.arc(ex, ey, olhoR * 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex, ey, olhoR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1b1f2a';
      ctx.beginPath();
      ctx.arc(ex + ox * olhoR * 0.35, ey + oy * olhoR * 0.35, olhoR * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    if (p === 'carvao') {
      ctx.strokeStyle = '#1b1f2a';
      ctx.lineWidth = Math.max(1, r * 0.12);
      ctx.beginPath();
      ctx.moveTo(cx - r, corpoY - r * 0.12);
      ctx.lineTo(cx + r, corpoY - r * 0.12);
      ctx.stroke();
    }
  }
}

function desenharDetalhe(
  ctx: CanvasRenderingContext2D,
  p: Personagem,
  v: Visual,
  cx: number,
  topo: number,
  t: number,
  tempo: number,
): void {
  const u = t / 20;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (p) {
    case 'pavio': {
      // Um pavio enrolado com a fagulha piscando na ponta.
      ctx.strokeStyle = '#5a3a1a';
      ctx.lineWidth = u * 1.4;
      ctx.beginPath();
      ctx.moveTo(cx, topo + u);
      ctx.quadraticCurveTo(cx + u * 4, topo - u * 3, cx + u * 2, topo - u * 5);
      ctx.stroke();
      const brilho = 0.6 + 0.4 * Math.sin(tempo / 90);
      ctx.fillStyle = `rgba(255, 214, 107, ${brilho})`;
      ctx.beginPath();
      ctx.arc(cx + u * 2, topo - u * 5.5, u * 1.8, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'brasa': {
      // Três labaredas no topo.
      ctx.fillStyle = v.detalhe;
      for (const [dx, h] of [[-3, 4], [0, 6], [3, 4]] as const) {
        const balanco = Math.sin(tempo / 120 + dx) * u * 0.6;
        ctx.beginPath();
        ctx.moveTo(cx + dx * u - u * 1.6, topo + u * 1.5);
        ctx.quadraticCurveTo(cx + dx * u + balanco, topo - h * u, cx + dx * u + u * 1.6, topo + u * 1.5);
        ctx.fill();
      }
      break;
    }
    case 'faisca': {
      // Antena em zigue-zague.
      ctx.strokeStyle = '#7a5f00';
      ctx.lineWidth = u * 1.3;
      ctx.beginPath();
      ctx.moveTo(cx, topo + u);
      ctx.lineTo(cx - u * 2, topo - u * 2);
      ctx.lineTo(cx + u * 1.5, topo - u * 3);
      ctx.lineTo(cx - u * 0.5, topo - u * 6);
      ctx.stroke();
      break;
    }
    case 'nevoa': {
      // Nuvenzinha em volta da cabeça.
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (const [dx, dy, r] of [[-3.5, 0, 2.2], [0, -1.5, 2.8], [3.5, 0, 2.2]] as const) {
        ctx.beginPath();
        ctx.arc(cx + dx * u, topo + dy * u + Math.sin(tempo / 400 + dx) * u * 0.4, r * u, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'trovao': {
      // Dois chifrinhos.
      ctx.fillStyle = v.detalhe;
      for (const lado of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + lado * u * 2, topo + u * 2);
        ctx.lineTo(cx + lado * u * 4.5, topo - u * 3.5);
        ctx.lineTo(cx + lado * u * 5, topo + u * 2.5);
        ctx.fill();
      }
      break;
    }
    case 'musgo': {
      // Um broto de duas folhas.
      ctx.strokeStyle = '#2f8a43';
      ctx.lineWidth = u;
      ctx.beginPath();
      ctx.moveTo(cx, topo + u);
      ctx.lineTo(cx, topo - u * 3);
      ctx.stroke();
      ctx.fillStyle = v.detalhe;
      for (const lado of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(cx + lado * u * 2.4, topo - u * 3.5, u * 2.6, u * 1.2, lado * -0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'coral': {
      // Um laço.
      ctx.fillStyle = v.detalhe;
      for (const lado of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + u * 2, topo + u * 0.5);
        ctx.lineTo(cx + lado * u * 5 + u * 2, topo - u * 2);
        ctx.lineTo(cx + lado * u * 5 + u * 2, topo + u * 3);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(cx + u * 2, topo + u * 0.5, u * 1.3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'carvao': {
      // Gorrinho.
      ctx.fillStyle = '#2a2e37';
      ctx.beginPath();
      ctx.ellipse(cx, topo + u * 1.5, u * 5, u * 2.6, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = v.detalhe;
      ctx.beginPath();
      ctx.arc(cx, topo - u * 1.6, u * 1.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
}
