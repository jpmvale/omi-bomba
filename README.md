# OmiBomba

Jogo de bombas em grade direto no navegador, cada um no seu aparelho, numa sala com link de
convite. De 2 a 5 na arena: solte bombas, quebre caixas, pegue itens e seja o último em pé.

Regras completas em [`docs/regras.md`](docs/regras.md). No ar em
<https://omi-bomba.imp-software.cloud>.

Irmão do [Dominó](https://github.com/jpmvale/domino) e do [FDP](https://github.com/jpmvale/fdp):
mesma arquitetura de sala, convite e bots, e o mesmo jeito de publicar na VPS.

## O que tem

- Sala com código de 5 letras e link `/j/{código}` que chega no WhatsApp como cartão.
- Oito personagens próprios para escolher (Pavio, Brasa, Faísca, Névoa, Trovão, Musgo,
  Coral, Carvão), únicos na arena.
- Bots em três níveis para completar a arena.
- Arena 15×13 nova a cada rodada, com caixas, itens de **fogo** (alcance) e **velocidade**,
  explosão em corrente e arena que fecha em espiral depois de 90 s.
- Partida em 1, 2, 3 ou 5 rodadas vencidas; revanche ou volta à sala.
- Teclado (setas/WASD + espaço) e toque (direcional e botão de bomba na tela).
- Chat com silenciar e expulsar; espectadores; reconexão sozinha, com um bot segurando o
  personagem enquanto a pessoa está fora.

## Desenvolvimento

Requer Node 22+ (a imagem de produção usa o 24).

```bash
npm install
npm run build:client   # obrigatório antes do primeiro `npm start`
npm start              # http://localhost:3000
npm test
npm run typecheck
```

Para mexer na interface com recarga automática, rode `npm run dev:client` junto com
`npm start`. Sem `REDIS_URL` as salas ficam em memória; `npm run redis` sobe um Redis local
na porta 6381. Variáveis em [`.env.example`](.env.example).

## Arquitetura

```
packages/rules/      motor: arena, movimento, bomba, fogo, itens, rodada — puro e determinístico
packages/bot/        decisão dos bots, com a mesma visão que a pessoa tem
packages/protocol/   contrato cliente ↔ servidor + validação (zod, só no servidor)
packages/room/       sala: lobby, anfitrião, relógio de 20 passos/s, chat, bots no volante
packages/store/      salas vivas em memória ou no Redis
server/              HTTP (Hono) + WebSocket (ws) num processo só
app/                 cliente Vite + React, arena desenhada em canvas
```

- **O servidor é a única autoridade.** O cliente manda só a tecla apertada e desenha o que
  recebe ([ADR-O02](docs-tec/decisoes-tecnicas.md)).
- O que está escondido nas caixas nunca sai do servidor.

Decisões em [`docs-tec/decisoes-tecnicas.md`](docs-tec/decisoes-tecnicas.md), publicação em
[`docs-tec/deploy.md`](docs-tec/deploy.md), estado atual em
[`docs-tec/HANDOFF.md`](docs-tec/HANDOFF.md).

## Licença

MIT.
