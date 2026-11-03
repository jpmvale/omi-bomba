/**
 * O próprio boneco anda na hora em que a tecla desce.
 *
 * Esperar o servidor é esperar a ida da tecla, o passo seguinte (até 50 ms) e
 * a volta do quadro — e ainda o quadro de interpolação do desenho. Somado, o
 * boneco obedece um bom tempo depois do dedo, e é isso que parecia "lag".
 *
 * Então o navegador anda com o próprio jogador por conta própria, com a MESMA
 * regra do servidor (`moverJogador`, de `@omi-bomba/rules`), num relógio de
 * passos local. Cada entrada leva um número; o quadro devolve o número da
 * última que o servidor aplicou e há quantos passos (`entradaSeq`,
 * `entradaPasso`). Com isso dá para saber a que passo LOCAL o retrato do
 * servidor corresponde: parte-se dele e repassam-se as entradas que vieram
 * depois. Concordando, nada muda na tela; discordando (uma bomba que ninguém
 * via, um empurrão da arena fechando), a tela se corrige em poucos quadros.
 *
 * O servidor continua sendo a autoridade: o que esta previsão decide só vale
 * para o desenho. Os outros jogadores seguem interpolados entre quadros.
 */

import {
  DELTA,
  LARGURA,
  OPOSTA,
  TICK_MS,
  TOQUE_PASSOS,
  UNIDADE,
  ALTURA,
  moverJogador,
  type Andante,
  type Dir,
  type JogadorVisto,
  type MatchView,
} from '@omi-bomba/rules';

interface Entrega {
  seq: number;
  /** Passo local em que a entrada passa a valer. */
  tick: number;
  dir: Dir | null;
  bomba: boolean;
}

export interface Previsto {
  /** Posição contínua, em casas. */
  x: number;
  y: number;
  olhando: Dir;
  /** De 0 a 1: quanto da casa já andou (para a animação dos pés). */
  anda: number;
}

/** Quanto o desenho guarda de história: 10 s. */
const HISTORIA_PASSOS = 200;
/** Em quanto tempo uma correção some da tela. */
const SUAVIZA_MS = 70;

export interface Previsao {
  /** Registra uma entrada e devolve o número com que ela vai ao servidor. */
  registrar(dir: Dir | null, bomba: boolean, agora: number): number;
  /** Onde desenhar o próprio jogador agora, ou `null` se não há o que prever. */
  onde(view: MatchView, grade: string, agora: number): Previsto | null;
}

export function criarPrevisao(eu: string, inicio = performance.now()): Previsao {
  const historico: Entrega[] = [];
  let seq = 0;
  let ultimoMatch = '';
  // Suavização: o que a tela mostrava e o desvio que ainda resta apagar.
  let desenhado: [number, number] | null = null;
  let desvio: [number, number] = [0, 0];
  let quando = inicio;

  const tickDe = (agora: number): number => Math.floor((agora - inicio) / TICK_MS);

  return {
    registrar(dir, bomba, agora) {
      seq += 1;
      historico.push({ seq, tick: tickDe(agora) + 1, dir, bomba });
      return seq;
    },

    onde(view, grade, agora) {
      const s = view.jogadores.find((j) => j.id === eu);
      if (view.matchId !== ultimoMatch) {
        ultimoMatch = view.matchId;
        desenhado = null;
      }
      if (!s || !s.vivo || view.fase !== 'JOGANDO') {
        desenhado = null;
        return null;
      }
      // Recarregou a página no meio da partida: a numeração continua da do servidor.
      if (seq < s.entradaSeq) seq = s.entradaSeq;

      const agoraTick = tickDe(agora);
      // Esquece o que o servidor já aplicou há muito tempo.
      while (historico.length > 1 && historico[0]!.seq < s.entradaSeq && historico[1]!.seq <= s.entradaSeq) historico.shift();
      while (historico.length > 0 && historico[0]!.tick < agoraTick - HISTORIA_PASSOS) historico.shift();

      // A que passo local este retrato corresponde.
      const aplicada = historico.find((e) => e.seq === s.entradaSeq);
      let base: number;
      if (aplicada) base = aplicada.tick + (view.passo - s.entradaPasso) - 1;
      else {
        const primeira = historico.find((e) => e.seq > s.entradaSeq);
        base = primeira ? primeira.tick - 1 : agoraTick;
      }
      base = Math.min(base, agoraTick);

      // Repassa as entradas que vieram depois, passo a passo, até um passo à
      // frente de agora: o desenho fica entre "agora" e "o próximo".
      const corpo = copiar(s, view.passo, base);
      const bombas = view.bombas.filter((b) => b.carregadaPor === null && b.voo === null).map((b) => [b.x, b.y] as const);
      const minhas = view.bombas.filter((b) => b.dono === eu).length;
      const livre = (x: number, y: number): boolean => {
        if (x < 0 || y < 0 || x >= LARGURA || y >= ALTURA || grade[y * LARGURA + x] !== '0') return false;
        return !bombas.some(([bx, by]) => bx === x && by === y);
      };
      let antes = posicao(corpo);
      let soltas = 0;
      for (let t = base + 1; t <= agoraTick + 1; t++) {
        for (const e of historico) {
          if (e.seq <= s.entradaSeq) continue;
          // Entrada que chegou atrasada ao servidor entra no primeiro passo repassado.
          if (e.tick !== t && !(t === base + 1 && e.tick <= base)) continue;
          aplicar(corpo, e, t);
          // A bomba que acabou de soltar barra a volta, como no servidor.
          if (e.bomba && !s.luva && s.maldicao?.tipo !== 'SEM_BOMBA' && minhas + soltas < s.bombas) {
            soltas += 1;
            const c = casa(corpo);
            if (!bombas.some(([bx, by]) => bx === c[0] && by === c[1])) bombas.push(c);
          }
        }
        if (t === agoraTick + 1) antes = posicao(corpo);
        moverJogador(corpo, t, livre);
      }
      const depois = posicao(corpo);
      const alpha = Math.min(1, Math.max(0, (agora - inicio) / TICK_MS - agoraTick));
      const alvo: [number, number] = [antes[0] + (depois[0] - antes[0]) * alpha, antes[1] + (depois[1] - antes[1]) * alpha];

      // Correção pequena desliza; salto grande (rodada nova, voltar da borda) é salto.
      if (desenhado) {
        const dx = desenhado[0] - alvo[0];
        const dy = desenhado[1] - alvo[1];
        const pulo = Math.abs(dx - desvio[0]) + Math.abs(dy - desvio[1]);
        if (Math.abs(dx) + Math.abs(dy) > 1.5) desvio = [0, 0];
        else if (pulo > 0.35) desvio = [dx, dy];
      }
      const fator = Math.exp(-(agora - quando) / SUAVIZA_MS);
      quando = agora;
      desvio = [desvio[0] * fator, desvio[1] * fator];
      const x = alvo[0] + desvio[0];
      const y = alvo[1] + desvio[1];
      desenhado = [x, y];
      return { x, y, olhando: corpo.olhando, anda: corpo.mov ? corpo.mov.progresso / UNIDADE : 0 };
    },
  };
}

/** O retrato do servidor, com o prazo do toque trazido para o relógio local. */
function copiar(s: JogadorVisto, passoDoServidor: number, base: number): Andante {
  return {
    x: s.x,
    y: s.y,
    mov: s.mov ? { ...s.mov } : null,
    olhando: s.olhando,
    querDir: s.querDir,
    toque: s.toque ? { dir: s.toque.dir, ate: s.toque.ate - passoDoServidor + base } : null,
    maldicao: s.maldicao,
    velocidade: s.velocidade,
  };
}

/** O que `aplicarEntrada` faz no servidor, para gente (com o toque guardado). */
function aplicar(j: Andante, e: Entrega, t: number): void {
  const rumo = j.mov && j.maldicao?.tipo === 'INVERTIDO' ? OPOSTA[j.mov.dir] : j.mov?.dir;
  if (e.dir !== null && e.dir !== j.querDir && e.dir !== rumo) j.toque = { dir: e.dir, ate: t - 1 + TOQUE_PASSOS };
  j.querDir = e.dir;
}

function posicao(j: Andante): [number, number] {
  if (!j.mov) return [j.x, j.y];
  const [dx, dy] = DELTA[j.mov.dir];
  const f = j.mov.progresso / UNIDADE;
  return [j.x + dx * f, j.y + dy * f];
}

function casa(j: Andante): readonly [number, number] {
  if (!j.mov || j.mov.progresso < UNIDADE / 2) return [j.x, j.y];
  const [dx, dy] = DELTA[j.mov.dir];
  return [j.x + dx, j.y + dy];
}
