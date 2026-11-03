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
frequência. Depois dos minutos escolhidos na sala (1, 3 ou 5) cai um bloco a cada 8
passos, de (1,1) em espiral até o centro; o bot trata as próximas casas da espiral como
perigo. O fim da espiral é o teto da rodada — não há mais um relógio separado. A queda
dos blocos é desenhada só no cliente: a espiral é geometria fixa, e o passo de cada bloco
é `fechaNoPasso + k * 8`, então nada disso precisa ir no quadro.

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

## ADR-O10 — Bot não planeja de duas casas que discordam

O bot planeja a partir da casa para onde está indo. No meio do caminho entre A e B, o plano
feito de B dizia "volta para A" e, depois de inverter, o plano feito de A dizia "vai para
B": o bot tremia no lugar (20 casos em 30 partidas simuladas no difícil). Três correções,
cada uma fechando um caminho desse laço: (1) ao chegar ao alvo andando, o bot solta a
direção em vez de cair no passeio ao acaso; (2) só inverte se o plano feito da casa de
onde saiu também mandar ficar ou seguir por lá; (3) no motor, quem dá meia-volta para no
centro da casa a que voltou, sem levar a sobra do passo adiante (RN-21). A simulação
agora tem um teste que conta esse tremor e exige zero.

## ADR-O11 — Quem matou quem sai do fogo, não de um palpite

Cada chama guarda os donos das bombas cujo fogo passou por ela (`donos`). A morte credita
o primeiro dono que não é a vítima; os outros viram assistência. Corrente de bombas
credita o dono da bomba cujo fogo chegou à casa, não quem começou a corrente. O histórico
(`abates`) vai inteiro no fim da rodada e da partida; durante a rodada o quadro de 20 por
segundo leva só os da rodada.

## ADR-O12 — Itens com efeito, não com estado novo por item

Bomba, chute e caveira são campos do jogador (`bombas`, `chute`, `maldicao`), e a bomba
chutada tem um `deslize` igual ao movimento do jogador. Sorteios novos (qual maldição,
onde caem os itens de quem morreu) saem de `createRng(semente:motivo:passo:jogador)`: o
motor continua puro e a mesma partida repetida dá o mesmo resultado.
