/**
 * O que precisa ser verdade depois de QUALQUER passo. Os testes conferem isto a
 * cada passo de centenas de partidas simuladas por bots; um defeito de regra
 * que só aparece na rodada 40 de uma combinação rara aparece aqui.
 */

import { ALCANCE_MAX, ALTURA, BOMBAS_MAX, LARGURA, UNIDADE, VELOCIDADE_MAX_NIVEL } from './constantes.js';
import { DELTA, indice } from './mapa.js';
import { CHAO, type MatchState } from './types.js';

export function conferirInvariantes(m: MatchState): string[] {
  const erros: string[] = [];
  if (m.grade.length !== LARGURA * ALTURA) erros.push('grade com tamanho errado');

  for (const j of m.jogadores) {
    // Morto fica onde caiu, e a arena pode fechar por cima dele.
    if (j.vivo && m.grade[indice(j.x, j.y)] !== CHAO) erros.push(`${j.id} parado dentro de bloco em ${j.x},${j.y}`);
    if (j.mov) {
      if (j.mov.progresso <= 0 || j.mov.progresso >= UNIDADE) erros.push(`${j.id} com progresso ${j.mov.progresso}`);
      const [dx, dy] = DELTA[j.mov.dir];
      if (m.grade[indice(j.x + dx, j.y + dy)] !== CHAO) erros.push(`${j.id} andando para dentro de bloco`);
    }
    if (j.alcance < 1 || j.alcance > ALCANCE_MAX) erros.push(`${j.id} com alcance ${j.alcance}`);
    if (j.velocidade < 0 || j.velocidade > VELOCIDADE_MAX_NIVEL) erros.push(`${j.id} com velocidade ${j.velocidade}`);
    if (!j.vivo && j.mov) erros.push(`${j.id} morto e andando`);
    const minhas = m.bombas.filter((b) => b.dono === j.id).length;
    if (j.bombas < 1 || j.bombas > BOMBAS_MAX) erros.push(`${j.id} com capacidade ${j.bombas}`);
    // Quem morre devolve a capacidade, mas as bombas que já armou ainda explodem.
    if (j.vivo && minhas > j.bombas) erros.push(`${j.id} com ${minhas} bombas armadas e capacidade ${j.bombas}`);
    if (!j.vivo && (j.maldicao || j.chute)) erros.push(`${j.id} morto ainda com item`);
  }

  const casas = new Set<number>();
  for (const b of m.bombas) {
    const i = indice(b.x, b.y);
    if (casas.has(i)) erros.push(`duas bombas em ${b.x},${b.y}`);
    casas.add(i);
    if (m.grade[i] !== CHAO) erros.push(`bomba dentro de bloco em ${b.x},${b.y}`);
    if (b.deslize && (b.deslize.progresso < 0 || b.deslize.progresso >= UNIDADE)) erros.push(`bomba ${b.id} com deslize ${b.deslize.progresso}`);
  }
  for (const it of m.itens) {
    if (m.grade[indice(it.x, it.y)] !== CHAO) erros.push(`item dentro de bloco em ${it.x},${it.y}`);
  }
  for (const i of Object.keys(m.ocultos)) {
    if (m.grade[Number(i)] !== 2) erros.push(`item oculto fora de caixa na célula ${i}`);
  }
  const itensVistos = new Set<number>();
  for (const it of m.itens) {
    const i = indice(it.x, it.y);
    if (itensVistos.has(i)) erros.push(`dois itens em ${it.x},${it.y}`);
    itensVistos.add(i);
  }
  const mortos = m.jogadores.filter((j) => !j.vivo).length;
  const abatesDaRodada = m.abates.filter((a) => a.rodada === m.rodada).length;
  if (abatesDaRodada !== mortos) erros.push(`${mortos} mortos e ${abatesDaRodada} abates na rodada`);
  const placarTotal = Object.values(m.placar).reduce((a, b) => a + b, 0);
  if (placarTotal > m.rodada) erros.push('mais vitórias que rodadas');
  return erros;
}
