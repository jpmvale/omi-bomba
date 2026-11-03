# Decisões técnicas (ADR-O*)

Cada decisão: o que, por quê, e o que se perde. Mudou uma, escreve outra que a substitui.

## ADR-O01 — Família B do guia: Node + Redis, sem banco

Mesmo arranjo do Dominó e do FDP: workspaces npm, `server` com Hono + `ws` num processo
só, cliente Vite + React servido pelo mesmo processo, Redis sem persistência para as salas
vivas. Não há dado insubstituível (não há contas nem histórico), então não há Postgres
nem backup de banco. **Perde-se:** contas e ranking, que ficam para quando houver motivo.

## ADR-O02 — Servidor autoritativo a 20 passos por segundo

O motor (`packages/rules`) é puro e determinístico: `passo(estado) → estado`. O servidor
dá um passo a cada 50 ms (`TICK_MS`); o cliente só manda a intenção (`game:input`:
direção apertada e bomba) e desenha o que recebe. Ninguém consegue andar através de
parede ou soltar duas bombas mexendo no cliente.
**Perde-se:** latência. Com 50 ms de passo mais a rede, a tecla aparece na tela em
~100–150 ms. Compensa-se na tela com interpolação entre os dois últimos quadros; não há
predição no cliente (ainda).

## ADR-O03 — Posições inteiras e movimento de casa em casa

Posição é a casa (`x`, `y` inteiros) mais um movimento em curso com progresso de 0 a
1000 (`UNIDADE`). Nada de ponto flutuante no motor: a simulação dá o mesmo resultado em
qualquer máquina, e os testes podem comparar estados inteiros. Virar só no centro da
casa elimina o "raspar na quina" que exigiria correção de colisão.

## ADR-O04 — Quadro (`game:frame`) separado do retrato da sala (`room:state`)

`room:state` sobe a versão da sala e vai quando algo da SALA muda (entrou alguém, fim de
rodada). `game:frame` vai a cada passo, sem versão, com a arena projetada. A grade (195
casas) só vai no quadro quando muda (`gradeVersao`), e o quadro é serializado uma vez por
sala, não por pessoa: todos veem a mesma arena. A tecla não passa por `commit`, para não
mandar o retrato inteiro a cada seta.

## ADR-O05 — O que está escondido não sai do servidor

O que tem dentro de cada caixa (`ocultos`) e a semente do sorteio ficam fora da projeção
(`project`, por lista de permissão). O bot recebe a mesma visão (`VisaoDoBot` sem
`ocultos`), então não "sabe" onde estão os itens — o teste confere que a decisão não muda.

## ADR-O06 — Arena que fecha em espiral

Sem isso, rodadas entre bots cautelosos (ou pessoas) acabavam em empate por tempo com
frequência. Depois de 90 s a arena fecha uma casa a cada 8 passos, de fora para dentro;
o bot trata as próximas casas da espiral como perigo. Na simulação de 12 partidas os
empates por tempo caíram a quase zero.

## ADR-O07 — Bot ao volante na queda, bot de vez na saída

Diferente do Dominó, não há pausa: um jogo em tempo real não pode parar para esperar
alguém. Quem cai ou vai para segundo plano tem o personagem dirigido pelo bot (médio) até
voltar; quem sai ou é expulso vira bot permanente. A rodada nunca para.

## ADR-O08 — Personagem é cosmético

Os 8 personagens só mudam desenho e cor. Poder diferente por personagem pede
balanceamento que ainda não existe; quando existir, é uma RN nova.

## ADR-O09 — Desenho em canvas, não DOM

195 casas, até 5 jogadores, bombas e chamas a 60 fps: no DOM seriam centenas de nós
mudando por quadro. O canvas desenha tudo de uma vez, com `devicePixelRatio`.
