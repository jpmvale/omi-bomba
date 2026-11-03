# Regras do OmiBomba

As regras de produto (RN-*). O motor em `packages/rules` é a fonte da verdade; os
números vêm de `packages/rules/src/constantes.ts`, e mudar um deles é mudar uma RN.

## A sala

- **RN-01** Sala com código de 5 letras e link `/j/{código}`. Até **5** na arena e até
  **6** assistindo.
- **RN-02** Cada um escolhe apelido e **personagem**. Os dois são únicos entre quem está
  na arena: quem chega com um repetido ganha o primeiro livre (e o apelido ganha um número).
  O personagem é só visual: nenhum joga diferente do outro.
- **RN-03** Personagens: Pavio, Brasa, Faísca, Névoa, Trovão, Musgo, Coral e Carvão.
- **RN-04** O anfitrião chama bots (fácil, médio, difícil) para completar a arena, até 4.
- **RN-05** Começa com pelo menos 2 na arena, todos prontos e ao menos uma pessoa de verdade.
- **RN-06** O anfitrião escolhe quantas rodadas vencem a partida: 1, 2, **3** (padrão) ou 5.
- **RN-07** O anfitrião escolhe depois de quantos minutos a arena começa a fechar: **1**
  (padrão), 3 ou 5.

## A arena

- **RN-10** Grade de 15×13 casas: borda de parede, pilares fixos nas casas de coordenadas
  pares, e caixas sorteadas em ~70% do chão restante. Cada rodada sorteia uma arena nova.
- **RN-11** Os nascedouros (os 4 cantos e o centro) e as casas vizinhas nascem sem caixa,
  para ninguém começar trancado.
- **RN-12** ~35% das caixas escondem um item. Ninguém sabe qual até a caixa quebrar. O
  sorteio pesa: fogo 30, bomba 28, velocidade 22, caveira 12, chute 8 (o mais raro).

## Andar

- **RN-20** Anda de casa em casa nas 4 direções, enquanto a tecla estiver apertada. Soltar
  termina a casa em que está (ninguém para entre duas casas).
- **RN-21** Voltar no sentido contrário é na hora, e para no centro da casa a que voltou;
  virar para o lado só acontece no centro de uma casa.
- **RN-22** Parede, pilar, caixa e bomba bloqueiam. Exceção: quem acabou de soltar uma
  bomba pode sair de cima dela; depois que saiu, ela bloqueia como as outras.
- **RN-23** Jogadores atravessam uns aos outros.

## Bomba e fogo

- **RN-30** Cada jogador começa podendo ter **uma** bomba armada por vez; o item de bomba
  soma uma (até 8). A bomba sai na casa em que ele está.
- **RN-31** O pavio dura **2,5 s**. A explosão acende uma cruz com o alcance do dono
  (começa em **2**) e dura **0,5 s**.
- **RN-32** O fogo para em parede e pilar; quebra a primeira caixa que encontra e para nela;
  destrói o item que encontrar no chão e para nele.
- **RN-33** Fogo que encosta noutra bomba a detona no mesmo instante (corrente).
- **RN-34** Quem estiver numa casa com fogo morre. Mortes do mesmo instante contam juntas.
- **RN-35** O item que estava na caixa só aparece quando o fogo que a abriu apaga.

## Itens

- **RN-40** **Fogo**: +1 de alcance, até 8.
- **RN-41** **Velocidade**: +1 nível, até 4 níveis acima do normal.
- **RN-42** Pega quem passar pela casa.
- **RN-43** **Bomba**: +1 bomba armada ao mesmo tempo, até 8.
- **RN-44** **Chute**: andar contra uma bomba parada a empurra naquela direção. Ela escorrega
  (1 casa a cada 0,15 s) até a casa antes de parede, caixa, outra bomba, item ou jogador, e
  explode onde estiver quando o pavio acabar. Sem chute, bomba é obstáculo.
- **RN-45** **Caveira**: maldição por 15 s, sorteada entre direcional invertido, não poder
  soltar bomba e ficar lento. Quem está com ela e cruza (fica na mesma casa) com alguém sem
  caveira passa a maldição adiante, com o tempo cheio, e fica livre; por 2 s não a recebe de
  volta.
- **RN-46** Quem morre espalha pela arena tudo que tinha pegado: cada nível de fogo,
  velocidade e bomba, o chute e a caveira viram itens em casas livres sorteadas (fora do fogo
  e das casas que a arena fecha nos 5 s seguintes).

## Rodada e partida

- **RN-50** Contagem de 3 s antes de cada rodada.
- **RN-51** Vence a rodada quem ficar por último em pé. Se os últimos morrem no mesmo
  instante, é empate e ninguém pontua.
- **RN-52** Depois dos minutos combinados (RN-07), blocos caem do céu, um a cada 0,4 s,
  começando no canto de cima à esquerda (1,1) e seguindo em espiral pelas bordas até o
  centro. Quem estiver na casa em que o bloco cai morre. As próximas casas piscam antes, e a
  sombra do bloco aparece enquanto ele cai.
- **RN-53** A rodada termina, no máximo, quando o último bloco cai (todos que sobraram
  morrem: empate).
- **RN-54** Entre rodadas, 4 s de placar. Vence a partida quem chegar primeiro às vitórias
  combinadas.
- **RN-55** O anfitrião pode encerrar: leva quem lidera sozinho; empatados, ninguém.
- **RN-56** No fim, o anfitrião escolhe revanche (mesmo grupo, começa direto) ou voltar à sala.

## Registro

- **RN-57** Cada eliminação fica registrada: a vítima, o autor (dono do fogo que a pegou; a
  própria vítima se foi a bomba dela; ninguém se foi a arena) e as assistências (donos de
  outros fogos que estavam na mesma casa no mesmo instante).
- **RN-58** No fim da partida aparecem, para cada um, rodadas vencidas, abates (sem contar a
  própria bomba), mortes e assistências, e o registro de quem pegou quem rodada a rodada.

## Queda e saída

- **RN-60** Caiu a conexão ou foi para segundo plano: um bot segura o personagem até a pessoa
  voltar. Ela volta no próprio personagem, onde ele estiver.
- **RN-61** Saiu ou foi expulso no meio da partida: um bot assume de vez, e a partida segue.
- **RN-62** Quem chega com a partida rolando assiste e joga a próxima.
