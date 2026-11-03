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
  sorteio pesa: fogo 28, bomba 26, velocidade 20, caveira 12, chute 7 e luva 7 (os mais raros).

## Andar

- **RN-20** Anda de casa em casa nas 4 direções, enquanto a tecla estiver apertada. Soltar
  termina a casa em que está (ninguém para entre duas casas).
- **RN-21** Voltar no sentido contrário é na hora, e para no centro da casa a que voltou;
  virar para o lado só acontece no centro de uma casa.
- **RN-24** A tecla apertada vale por 0,3 s mesmo se for solta antes: o toque rápido de
  volta não se perde, e a curva pedida um pouco antes da esquina é feita nela (voltar à
  tecla que se segurava não cancela a curva pedida). Só vale para gente; o bot decide a
  cada passo.
- **RN-25** O próprio boneco obedece na hora na tela de quem joga; o servidor confirma e,
  discordando, a tela se corrige em poucos quadros.
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
  velocidade e bomba, o chute, a luva e a caveira viram itens em casas livres sorteadas (fora do fogo
  e das casas que a arena fecha nos 5 s seguintes).
- **RN-47** **Luva** (rara como o chute): de frente para uma bomba parada, o botão de ação a
  levanta em vez de soltar outra; apertando de novo, ela é arremessada 2 casas para onde o
  jogador olha. Se cai em parede, pilar, caixa, bomba, item ou jogador, quica casa a casa na
  mesma direção até achar uma livre; passando da borda, entra pelo outro lado da arena. Na
  mão e no ar o pavio fica parado. Quem morre carregando deixa a bomba cair ali.

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

## Fantasma na borda

- **RN-70** Quem morre vira fantasma 1 s depois, na casa da borda mais perto de onde caiu.
  A borda é o anel de parede em volta da arena, fora da área de jogo.
- **RN-71** O fantasma anda pela borda com ← e →: em cima e embaixo, para o lado da seta;
  nas laterais, ← sobe e → desce (↑ e ↓ também valem ali). Segurando a mesma tecla, dobra o
  canto.
- **RN-72** O botão de ação arremessa para dentro, 2 casas, a bomba do começo: uma por vez e
  com o fogo inicial, por mais itens que tivesse em vida. Ela quica como a da luva. Do canto
  não dá para arremessar.
- **RN-73** Fantasma não pega item, não leva fogo, não passa caveira e não conta para o fim
  da rodada: sobrando um vivo, a rodada acaba.
- **RN-74** Se o fogo da bomba do fantasma matar alguém, o fantasma **volta à arena** na casa
  de quem caiu, sem poderes, e fica 2 s imune ao fogo (pisca). A arena fechando ainda o mata.
  O abate conta no registro, marcado como volta da borda.

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
