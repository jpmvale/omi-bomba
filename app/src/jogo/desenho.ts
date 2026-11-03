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
  anelEm,
  ESPIRAL,
  FECHAMENTO_INTERVALO_PASSOS,
  fechadasEm,
  LARGURA,
  TICK_MS,
  UNIDADE,
  type JogadorVisto,
  type MatchView,
  type TipoItem,
} from '@omi-bomba/rules';
import type { Quadro } from './arena';
import { desenharPersonagem } from './personagens';
import type { Previsto } from './previsao';

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
  itemChute: '#c0392b',
  itemLuva: '#e8a33d',
  itemLuvaLinha: '#8a5a12',
  itemFundo: '#f3eee2',
  caveiraFundo: '#3a2346',
  caveira: '#ece6f5',
};

/** Quantos passos o bloco leva caindo do céu até a casa. */
const QUEDA_PASSOS = 12;

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

/** Onde o fantasma está na borda, em casas. */
function posicaoDoFantasma(j: JogadorVisto): [number, number] | null {
  const f = j.fantasma;
  if (!f) return null;
  const [ax, ay] = anelEm(f.anel);
  if (!f.mov) return [ax, ay];
  const [bx, by] = anelEm(f.anel + f.mov.sentido);
  const t = f.mov.progresso / UNIDADE;
  return [ax + (bx - ax) * t, ay + (by - ay) * t];
}

/** Bomba no ar: a posição no chão (dando a volta na arena) e a altura do arco, em casas. */
function posicaoNoAr(b: MatchView['bombas'][number], progresso: number): [number, number, number] {
  const voo = b.voo!;
  const [dx, dy] = DELTA[voo.dir];
  const k = progresso / UNIDADE;
  const x = (((voo.deX + dx * k) % LARGURA) + LARGURA) % LARGURA;
  const y = (((voo.deY + dy * k) % ALTURA) + ALTURA) % ALTURA;
  // Um arco por casa: o primeiro trecho é o arremesso, os seguintes os quiques.
  const trecho = Math.min(k / 2, 1);
  const altura = k <= 2 ? Math.sin(Math.PI * trecho) * 1.1 : Math.abs(Math.sin(Math.PI * (k - 2))) * 0.45;
  return [x, y, altura];
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
  eu: string | null = null,
  previsto: Previsto | null = null,
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

  // Bombas: incham conforme o pavio acaba. A chutada desliza entre os quadros.
  // A que está na mão é desenhada em cima de quem carrega; a que está no ar,
  // depois dos personagens, que ela passa por cima.
  const bombasAntes = new Map(anterior && anterior.view.matchId === v.matchId ? anterior.view.bombas.map((b) => [b.id, b]) : []);
  for (const b of v.bombas) {
    if (b.carregadaPor !== null || b.voo !== null) continue;
    const falta = Math.max(0, b.explodeNoPasso - passoAgora);
    let [bx, by] = posicaoDaBomba(b);
    const ja = bombasAntes.get(b.id);
    if (ja && (ja.deslize || b.deslize)) {
      const [ax, ay] = posicaoDaBomba(ja);
      bx = ax + (bx - ax) * alpha;
      by = ay + (by - ay) * alpha;
    }
    desenharBomba(ctx, bx * casa + casa / 2, by * casa + casa / 2, casa, falta, agora);
  }

  // Fogo
  for (const c of v.chamas) desenharChama(ctx, c.x * casa, c.y * casa, casa, c.forma, agora);

  // Personagens, de cima para baixo (quem está mais embaixo fica na frente).
  const antes = new Map(anterior && anterior.view.matchId === v.matchId ? anterior.view.jogadores.map((j) => [j.id, j]) : []);
  const ordem = [...v.jogadores].sort((a, b) => posicao(a)[1] - posicao(b)[1]);
  const cabecas = new Map<string, [number, number]>();
  for (const j of ordem) {
    const p = personagens.get(j.id) ?? 'pavio';
    const ja = antes.get(j.id);

    // Fantasma: anda pela borda, meio transparente, num carrinho de nuvem.
    const fx = posicaoDoFantasma(j);
    if (!j.vivo && fx) {
      let [x, y] = fx;
      const fa = ja ? posicaoDoFantasma(ja) : null;
      if (fa && Math.abs(fa[0] - x) + Math.abs(fa[1] - y) < 1.5) {
        x = fa[0] + (x - fa[0]) * alpha;
        y = fa[1] + (y - fa[1]) * alpha;
      }
      const cx = x * casa + casa / 2;
      const cy = y * casa + casa / 2;
      desenharNuvem(ctx, cx, cy + casa * 0.28, casa);
      ctx.save();
      ctx.globalAlpha = 0.6;
      desenharPersonagem(ctx, p, cx, cy - casa * 0.05, casa * 0.8, j.olhando, j.fantasma?.mov ? j.fantasma.mov.progresso / UNIDADE : 0, agora);
      ctx.restore();
      continue;
    }

    const meu = j.id === eu && j.vivo && previsto !== null;
    let [x, y] = posicao(j);
    let olhando = j.olhando;
    let anda = j.mov ? (j.mov.progresso / UNIDADE) : 0;
    if (meu) {
      ({ x, y, olhando, anda } = previsto);
    } else if (ja) {
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
    // Acabou de voltar da borda: pisca enquanto o fogo não o pega.
    const protegido = j.protegidoAte > passoAgora;
    if (protegido) {
      ctx.save();
      ctx.globalAlpha = Math.floor(agora / 90) % 2 === 0 ? 0.35 : 0.85;
    }
    desenharPersonagem(ctx, p, cx, cy, casa, olhando, anda, agora);
    if (protegido) ctx.restore();
    cabecas.set(j.id, [cx, cy - casa * 0.62]);
    // Com a caveira: ela pisca em cima da cabeça.
    if (j.maldicao && Math.floor(agora / 180) % 2 === 0) {
      desenharCaveira(ctx, cx, cy - casa * 0.62, casa * 0.42);
    }
  }

  // Bomba na mão, em cima da cabeça; bomba no ar, num arco por cima de tudo.
  for (const b of v.bombas) {
    const falta = Math.max(0, b.explodeNoPasso - passoAgora);
    if (b.carregadaPor !== null) {
      const cabeca = cabecas.get(b.carregadaPor);
      if (cabeca) desenharBomba(ctx, cabeca[0], cabeca[1] - casa * 0.05, casa * 0.8, falta, agora);
      continue;
    }
    if (!b.voo) continue;
    const ja = bombasAntes.get(b.id);
    const progresso = ja?.voo ? ja.voo.progresso + (b.voo.progresso - ja.voo.progresso) * alpha : b.voo.progresso;
    const [bx, by, h] = posicaoNoAr(b, progresso);
    const px = bx * casa + casa / 2;
    const py = by * casa + casa / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(px, py + casa * 0.3, casa * 0.25, casa * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
    desenharBomba(ctx, px, py - h * casa, casa, falta, agora);
  }

  // Os blocos do fechamento caem do céu: a espiral é geometria fixa e o passo
  // de cada um é conhecido, então a queda é calculada aqui, sem vir no quadro.
  if (v.fase === 'JOGANDO' && passoAgora >= v.fechaNoPasso - QUEDA_PASSOS) {
    const primeiro = Math.max(0, Math.floor((passoAgora - v.fechaNoPasso) / FECHAMENTO_INTERVALO_PASSOS));
    for (let k = primeiro; k < Math.min(ESPIRAL.length, primeiro + 3); k++) {
      const cai = v.fechaNoPasso + k * FECHAMENTO_INTERVALO_PASSOS;
      const falta = cai - passoAgora;
      if (falta < 0 || falta > QUEDA_PASSOS) continue;
      const i = ESPIRAL[k]!;
      const px = (i % LARGURA) * casa;
      const py = Math.floor(i / LARGURA) * casa;
      const f = falta / QUEDA_PASSOS; // 1 = lá em cima, 0 = chegou
      // A sombra cresce na casa enquanto o bloco desce.
      ctx.fillStyle = `rgba(0,0,0,${0.45 * (1 - f)})`;
      ctx.beginPath();
      ctx.ellipse(px + casa / 2, py + casa / 2, casa * 0.5 * (1 - f * 0.6), casa * 0.32 * (1 - f * 0.6), 0, 0, Math.PI * 2);
      ctx.fill();
      desenharBloco(ctx, px, py - f * f * casa * 5, casa, COR.fechou, COR.fechouTopo);
    }
  }
}

function posicaoDaBomba(b: MatchView['bombas'][number]): [number, number] {
  if (!b.deslize) return [b.x, b.y];
  const [dx, dy] = DELTA[b.deslize.dir];
  const f = b.deslize.progresso / UNIDADE;
  return [b.x + dx * f, b.y + dy * f];
}

function desenharNuvem(ctx: CanvasRenderingContext2D, cx: number, cy: number, t: number): void {
  ctx.fillStyle = 'rgba(236, 230, 245, 0.75)';
  ctx.beginPath();
  ctx.arc(cx - t * 0.22, cy, t * 0.16, 0, Math.PI * 2);
  ctx.arc(cx, cy - t * 0.05, t * 0.2, 0, Math.PI * 2);
  ctx.arc(cx + t * 0.22, cy, t * 0.16, 0, Math.PI * 2);
  ctx.fill();
}

function desenharCaveira(ctx: CanvasRenderingContext2D, cx: number, cy: number, t: number): void {
  ctx.fillStyle = COR.caveira;
  ctx.beginPath();
  ctx.arc(cx, cy - t * 0.08, t * 0.36, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(cx - t * 0.2, cy + t * 0.12, t * 0.4, t * 0.2);
  ctx.fillStyle = COR.caveiraFundo;
  ctx.beginPath();
  ctx.arc(cx - t * 0.13, cy - t * 0.06, t * 0.09, 0, Math.PI * 2);
  ctx.arc(cx + t * 0.13, cy - t * 0.06, t * 0.09, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(cx - t * 0.02, cy + t * 0.1, t * 0.04, t * 0.12);
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

function desenharItem(ctx: CanvasRenderingContext2D, px: number, py: number, t: number, tipo: TipoItem, agora: number): void {
  const m = t * 0.14;
  const flutua = Math.sin(agora / 250) * t * 0.03;
  ctx.fillStyle = tipo === 'CAVEIRA' ? COR.caveiraFundo : COR.itemFundo;
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
  } else if (tipo === 'BOMBA') {
    // Uma bomba pequena.
    ctx.fillStyle = COR.bomba;
    ctx.beginPath();
    ctx.arc(cx - t * 0.02, cy + t * 0.04, t * 0.19, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COR.bombaBrilho;
    ctx.beginPath();
    ctx.arc(cx - t * 0.09, cy - t * 0.03, t * 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COR.fogoMeio;
    ctx.beginPath();
    ctx.arc(cx + t * 0.16, cy - t * 0.2, t * 0.06, 0, Math.PI * 2);
    ctx.fill();
  } else if (tipo === 'CHUTE') {
    // Uma bota.
    ctx.fillStyle = COR.itemChute;
    ctx.fillRect(cx - t * 0.14, cy - t * 0.22, t * 0.16, t * 0.3);
    arredondado(ctx, cx - t * 0.14, cy + t * 0.02, t * 0.34, t * 0.16, t * 0.07);
    ctx.fill();
    ctx.fillStyle = '#7a1f16';
    ctx.fillRect(cx - t * 0.16, cy + t * 0.15, t * 0.38, t * 0.05);
  } else if (tipo === 'LUVA') {
    // Uma luva aberta: a palma e quatro dedos, e o polegar de lado.
    ctx.fillStyle = COR.itemLuva;
    ctx.strokeStyle = COR.itemLuvaLinha;
    ctx.lineWidth = Math.max(1, t * 0.04);
    arredondado(ctx, cx - t * 0.15, cy - t * 0.04, t * 0.3, t * 0.26, t * 0.08);
    ctx.fill();
    ctx.stroke();
    for (let k = 0; k < 4; k++) {
      arredondado(ctx, cx - t * 0.15 + k * t * 0.077, cy - t * 0.24, t * 0.07, t * 0.24, t * 0.035);
      ctx.fill();
      ctx.stroke();
    }
    arredondado(ctx, cx - t * 0.27, cy - t * 0.02, t * 0.15, t * 0.08, t * 0.04);
    ctx.fill();
    ctx.stroke();
  } else if (tipo === 'CAVEIRA') {
    desenharCaveira(ctx, cx, cy, t * 0.62);
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
