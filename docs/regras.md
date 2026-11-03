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

## A arena

- **RN-10** Grade de 15×13 casas: borda de parede, pilares fixos nas casas de coordenadas
  pares, e caixas sorteadas em ~70% do chão restante. Cada rodada sorteia uma arena nova.
- **RN-11** Os nascedouros (os 4 cantos e o centro) e as casas vizinhas nascem sem caixa,
  para ninguém começar trancado.
- **RN-12** ~30% das caixas escondem um item. Ninguém sabe qual até a caixa quebrar.

## Andar

- **RN-20** Anda de casa em casa nas 4 direções, enquanto a tecla estiver apertada. Soltar
  termina a casa em que está (ninguém para entre duas casas).
- **RN-21** Voltar no sentido contrário é na hora; virar para o lado só acontece no centro
  de uma casa.
- **RN-22** Parede, pilar, caixa e bomba bloqueiam. Exceção: quem acabou de soltar uma
  bomba pode sair de cima dela; depois que saiu, ela bloqueia como as outras.
- **RN-23** Jogadores atravessam uns aos outros.

## Bomba e fogo

- **RN-30** Uma bomba por jogador de cada vez, solta na casa em que ele está.
- **RN-31** O pavio dura **2,5 s**. A explosão acende uma cruz com o alcance do dono
  (começa em **2**) e dura **0,5 s**.
- **RN-32** O fogo para em parede e pilar; quebra a primeira caixa que encontra e para nela;
  destrói o item que encontrar no chão e para nele.
- **RN-33** Fogo que encosta noutra bomba a detona no mesmo instante (corrente).
- **RN-34** Quem estiver numa casa com fogo morre. Mortes do mesmo instante contam juntas.
- **RN-35** O item que estava na caixa só aparece quando o fogo que a abriu apaga.

## Itens

Só dois, de propósito: o jogo vai ganhar outros aos poucos.

- **RN-40** **Fogo**: +1 de alcance, até 8.
- **RN-41** **Velocidade**: +1 nível, até 4 níveis acima do normal.
- **RN-42** Pega quem passar pela casa.

## Rodada e partida

- **RN-50** Contagem de 3 s antes de cada rodada.
- **RN-51** Vence a rodada quem ficar por último em pé. Se os últimos morrem no mesmo
  instante, é empate e ninguém pontua.
- **RN-52** Depois de **90 s** a arena começa a fechar em espiral, de fora para dentro, uma
  casa a cada 0,4 s. Quem estiver na casa que fecha morre. As próximas casas piscam antes.
- **RN-53** A rodada tem teto de 3 min; se chegar lá, é empate.
- **RN-54** Entre rodadas, 4 s de placar. Vence a partida quem chegar primeiro às vitórias
  combinadas.
- **RN-55** O anfitrião pode encerrar: leva quem lidera sozinho; empatados, ninguém.
- **RN-56** No fim, o anfitrião escolhe revanche (mesmo grupo, começa direto) ou voltar à sala.

## Queda e saída

- **RN-60** Caiu a conexão ou foi para segundo plano: um bot segura o personagem até a pessoa
  voltar. Ela volta no próprio personagem, onde ele estiver.
- **RN-61** Saiu ou foi expulso no meio da partida: um bot assume de vez, e a partida segue.
- **RN-62** Quem chega com a partida rolando assiste e joga a próxima.
