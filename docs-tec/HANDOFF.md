# HANDOFF

## Estado

- Jogo jogável de ponta a ponta: sala com link, escolha de personagem, bots em 3 níveis,
  arena 15×13 a 20 passos/s, bombas, corrente, caixas, itens de fogo, velocidade, bomba,
  chute, luva (carrega e arremessa) e caveira, itens de quem morre espalhados, mortos
  jogando como fantasma na borda (e voltando se pegarem alguém), arena que fecha (1, 3 ou
  5 min) com blocos caindo do céu, registro de quem pegou quem com KDA no fim, revanche,
  chat, queda com bot ao volante.
- O próprio boneco é previsto no cliente com a mesma regra do servidor (ADR-O13); os
  outros seguem interpolados.
- Controles: teclado (setas/WASD + espaço) e toque (direcional + botão de bomba).
- Testes: motor, bot (com simulação de partidas inteiras conferindo invariantes), sala,
  servidor de ponta a ponta, previsão do cliente contra rede simulada, contrato do Redis
  (só com `REDIS_URL`).
- No ar em <https://omi-bomba.imp-software.cloud> desde 03/11/2026 (primeiro deploy
  `6d01cc9`). `DEPLOY_ENABLED=true`: push em `main` com CI verde publica sozinho. Sonda
  interna de minuto e sonda externa (Synthetic Monitoring) ativas.

## Próximos passos

1. Jogar com gente de verdade e ajustar números (pavio, velocidade, densidade de caixas).
2. Itens novos, um por vez, cada um como RN em `docs/regras.md`.
3. Prever também o fantasma na borda (hoje ele segue o quadro do servidor, interpolado).
3. Predição de movimento no cliente se a latência incomodar (ADR-O02).

## Como verificar

```bash
npm install && npm run typecheck && npm test
npm run build:client && npm start   # http://localhost:3000
```
