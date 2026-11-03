/**
 * O desenho da arena num `<canvas>`.
 *
 * O servidor manda 20 quadros por segundo; a tela pinta a 60. Entre dois
 * quadros, a posição de cada personagem é interpolada — o desenho fica um
 * quadro (50 ms) atrás do servidor, que é o preço de não ver ninguém andando
 * aos solavancos.
 */

import type { Personagem } from '@omi-bomba/protocol';
import {
  ALTURA,
  DELTA,
  ESPIRAL,
  fechadasEm,
  LARGURA,
  TICK_MS,
  UNIDADE,
  type JogadorVisto,
  type MatchView,
} from '@omi-bomba/rules';
import type { Quadro } from './arena';
import { desenharPersonagem } from './personagens';

const COR = {
  chao: '#1d2b22',
  chaoAlt: '#203026',
  parede: '#3b4252',
  paredeTopo: '#4c5466',
  paredeSombra: '#262b36',
  fechou: '#5b2f36',
  fechouTopo: '#74404a',
  caixa: '#a8763e',
  caixaTopo: '#c48d4f',
  caixaLinha: '#6e4a22',
  bomba: '#1b1f2a',
  bombaBrilho: '#5a6178',
  fogoFora: '#ff6a00',
  fogoMeio: '#ffb000',
  fogoDentro: '#fff2b0',
  itemFogo: '#ff6a00',
  itemVelocidade: '#3fa9f5',
  itemFundo: '#f3eee2',
};

export interface Medidas {
  casa: number;
  largura: number;
  altura: number;
}

export function medir(larguraDisponivel: number, alturaDisponivel: number): Medidas {
  const casa = Math.max(12, Math.floor(Math.min(larguraDisponivel / LARGURA, alturaDisponivel / ALTURA)));
  return { casa, largura: casa * LARGURA, altura: casa * ALTURA };
}

/** Posição contínua (em casas) do personagem num quadro. */
function posicao(j: JogadorVisto): [number, number] {
  if (!j.mov) return [j.x, j.y];
  const [dx, dy] = DELTA[j.mov.dir];
  const f = j.mov.progresso / UNIDADE;
  return [j.x + dx * f, j.y + dy * f];
}

const eBorda = (x: number, y: number): boolean => x === 0 || y === 0 || x === LARGURA - 1 || y === ALTURA - 1;
const ePilar = (x: number, y: number): boolean => x % 2 === 0 && y % 2 === 0;

export function desenharArena(
  ctx: CanvasRenderingContext2D,
  m: Medidas,
  atual: Quadro,
  anterior: Quadro | null,
  personagens: Map<string, Personagem>,
  agora: number,
): void {
  const { casa } = m;
  const v = atual.view;
  const grade = atual.grade;
  const alpha = Math.min(1, Math.max(0, (agora - atual.chegouEm) / TICK_MS));
  // Passo "contínuo": o do quadro mais a fração do caminho até o próximo.
  const passoAgora = v.passo + alpha;

  ctx.clearRect(0, 0, m.largura, m.altura);

  // Chão e blocos
  for (let y = 0; y < ALTURA; y++) {
    for (let x = 0; x < LARGURA; x++) {
      const c = grade[y * LARGURA + x];
      const px = x * casa;
      const py = y * casa;
      if (c === '1') {
        const fechou = !eBorda(x, y) && !ePilar(x, y);
        desenharBloco(ctx, px, py, casa, fechou ? COR.fechou : COR.parede, fechou ? COR.fechouTopo : COR.paredeTopo);
        continue;
      }
      ctx.fillStyle = (x + y) % 2 === 0 ? COR.chao : COR.chaoAlt;
      ctx.fillRect(px, py, casa, casa);
      if (c === '2') desenharCaixa(ctx, px, py, casa);
    }
  }

  // Aviso da arena fechando: as próximas casas da espiral piscam em vermelho
  // antes de virar parede. A espiral é geometria fixa, igual no cliente e no
  // servidor (`ESPIRAL` do motor), então não precisa vir no quadro.
  if (v.fase === 'JOGANDO' && passoAgora >= v.fechaNoPasso - 60) {
    const ja = fechadasEm(v.fechaNoPasso, Math.floor(passoAgora));
    const pulso = 0.35 + 0.25 * Math.sin(agora / 90);
    ctx.fillStyle = `rgba(239, 77, 90, ${pulso})`;
    for (let k = ja; k < Math.min(ESPIRAL.length, ja + 4); k++) {
      const i = ESPIRAL[k]!;
      ctx.fillRect((i % LARGURA) * casa, Math.floor(i / LARGURA) * casa, casa, casa);
    }
  }

  // Itens
  for (const it of v.itens) desenharItem(ctx, it.x * casa, it.y * casa, casa, it.tipo, agora);

  // Bombas: incham conforme o pavio acaba.
  for (const b of v.bombas) {
    const falta = Math.max(0, b.explodeNoPasso - passoAgora);
    desenharBomba(ctx, b.x * casa + casa / 2, b.y * casa + casa / 2, casa, falta, agora);
  }

  // Fogo
  for (const c of v.chamas) desenharChama(ctx, c.x * casa, c.y * casa, casa, c.forma, agora);

  // Personagens, de cima para baixo (quem está mais embaixo fica na frente).
  const antes = new Map(anterior && anterior.view.matchId === v.matchId ? anterior.view.jogadores.map((j) => [j.id, j]) : []);
  const ordem = [...v.jogadores].sort((a, b) => posicao(a)[1] - posicao(b)[1]);
  for (const j of ordem) {
    const p = personagens.get(j.id) ?? 'pavio';
    let [x, y] = posicao(j);
    const ja = antes.get(j.id);
    if (ja) {
      const [ax, ay] = posicao(ja);
      // Salto grande é rodada nova: teletransporta em vez de deslizar pela arena.
      if (Math.abs(ax - x) + Math.abs(ay - y) < 1.5) {
        x = ax + (x - ax) * alpha;
        y = ay + (y - ay) * alpha;
      }
    }
    const cx = x * casa + casa / 2;
    const cy = y * casa + casa / 2;
    if (!j.vivo) {
      const desde = j.morreuNoPasso === null ? 99 : passoAgora - j.morreuNoPasso;
      if (desde > 20) continue;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - desde / 20);
      ctx.translate(cx, cy);
      ctx.rotate(desde * 0.15);
      desenharPersonagem(ctx, p, 0, 0, casa * (1 - desde / 40), j.olhando, 0, agora);
      ctx.restore();
      continue;
    }
    const anda = j.mov ? (j.mov.progresso / UNIDADE) : 0;
    desenharPersonagem(ctx, p, cx, cy, casa, j.olhando, anda, agora);
  }
}

function desenharBloco(ctx: CanvasRenderingContext2D, px: number, py: number, t: number, cor: string, topo: string): void {
  ctx.fillStyle = COR.paredeSombra;
  ctx.fillRect(px, py, t, t);
  ctx.fillStyle = cor;
  ctx.fillRect(px + 1, py + 1, t - 2, t - 2);
  ctx.fillStyle = topo;
  ctx.fillRect(px + 1, py + 1, t - 2, Math.max(2, t * 0.22));
}

function desenharCaixa(ctx: CanvasRenderingContext2D, px: number, py: number, t: number): void {
  const m = Math.max(1, Math.round(t * 0.06));
  ctx.fillStyle = COR.caixaLinha;
  ctx.fillRect(px + m, py + m, t - 2 * m, t - 2 * m);
  ctx.fillStyle = COR.caixa;
  ctx.fillRect(px + 2 * m, py + 2 * m, t - 4 * m, t - 4 * m);
  ctx.fillStyle = COR.caixaTopo;
  ctx.fillRect(px + 2 * m, py + 2 * m, t - 4 * m, Math.max(2, t * 0.16));
  // As tábuas em X.
  ctx.strokeStyle = COR.caixaLinha;
  ctx.lineWidth = Math.max(1, t * 0.07);
  ctx.beginPath();
  ctx.moveTo(px + 3 * m, py + 3 * m);
  ctx.lineTo(px + t - 3 * m, py + t - 3 * m);
  ctx.moveTo(px + t - 3 * m, py + 3 * m);
  ctx.lineTo(px + 3 * m, py + t - 3 * m);
  ctx.stroke();
}

function desenharBomba(ctx: CanvasRenderingContext2D, cx: number, cy: number, t: number, falta: number, agora: number): void {
  // Pulsa mais rápido perto de explodir.
  const ritmo = falta < 15 ? 60 : 160;
  const escala = 1 + 0.08 * Math.sin(agora / ritmo);
  const r = t * 0.32 * escala;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + t * 0.3, r * 0.9, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  const grad = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
  grad.addColorStop(0, COR.bombaBrilho);
  grad.addColorStop(1, COR.bomba);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  // Pavio e fagulha
  ctx.strokeStyle = '#8a6a3a';
  ctx.lineWidth = Math.max(1, t * 0.06);
  ctx.beginPath();
  ctx.moveTo(cx + r * 0.4, cy - r * 0.8);
  ctx.quadraticCurveTo(cx + r * 0.9, cy - r * 1.3, cx + r * 0.6, cy - r * 1.5);
  ctx.stroke();
  ctx.fillStyle = Math.floor(agora / 80) % 2 === 0 ? COR.fogoMeio : COR.fogoDentro;
  ctx.beginPath();
  ctx.arc(cx + r * 0.6, cy - r * 1.55, t * 0.07, 0, Math.PI * 2);
  ctx.fill();
}

function desenharChama(ctx: CanvasRenderingContext2D, px: number, py: number, t: number, forma: 'CENTRO' | 'H' | 'V', agora: number): void {
  const tremor = 0.04 * Math.sin(agora / 40 + px + py);
  const camadas: [string, number][] = [[COR.fogoFora, 0.48], [COR.fogoMeio, 0.34], [COR.fogoDentro, 0.18]];
  for (const [cor, fr] of camadas) {
    const g = t * (fr + tremor);
    ctx.fillStyle = cor;
    const cx = px + t / 2;
    const cy = py + t / 2;
    if (forma === 'H' || forma === 'CENTRO') ctx.fillRect(px, cy - g, t, g * 2);
    if (forma === 'V' || forma === 'CENTRO') ctx.fillRect(cx - g, py, g * 2, t);
  }
}

function desenharItem(ctx: CanvasRenderingContext2D, px: number, py: number, t: number, tipo: 'FOGO' | 'VELOCIDADE', agora: number): void {
  const m = t * 0.14;
  const flutua = Math.sin(agora / 250) * t * 0.03;
  ctx.fillStyle = COR.itemFundo;
  arredondado(ctx, px + m, py + m + flutua, t - 2 * m, t - 2 * m, t * 0.18);
  ctx.fill();
  const cx = px + t / 2;
  const cy = py + t / 2 + flutua;
  if (tipo === 'FOGO') {
    // Uma labareda.
    ctx.fillStyle = COR.itemFogo;
    ctx.beginPath();
    ctx.moveTo(cx, cy - t * 0.26);
    ctx.quadraticCurveTo(cx + t * 0.24, cy, cx + t * 0.14, cy + t * 0.18);
    ctx.quadraticCurveTo(cx, cy + t * 0.26, cx - t * 0.14, cy + t * 0.18);
    ctx.quadraticCurveTo(cx - t * 0.24, cy, cx, cy - t * 0.26);
    ctx.fill();
    ctx.fillStyle = COR.fogoMeio;
    ctx.beginPath();
    ctx.arc(cx, cy + t * 0.08, t * 0.08, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Duas setas para a frente.
    ctx.strokeStyle = COR.itemVelocidade;
    ctx.lineWidth = Math.max(2, t * 0.09);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const dx of [-0.1, 0.1]) {
      ctx.beginPath();
      ctx.moveTo(cx + (dx - 0.08) * t, cy - t * 0.16);
      ctx.lineTo(cx + (dx + 0.08) * t, cy);
      ctx.lineTo(cx + (dx - 0.08) * t, cy + t * 0.16);
      ctx.stroke();
    }
  }
}

function arredondado(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Segundos que faltam na fase, para o relógio do placar. */
export function segundosRestantes(v: MatchView): number {
  return Math.max(0, Math.ceil(((v.faseAtePasso - v.passo) * TICK_MS) / 1000));
}
