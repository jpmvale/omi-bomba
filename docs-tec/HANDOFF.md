# HANDOFF

## Estado

- Jogo jogável de ponta a ponta: sala com link, escolha de personagem, bots em 3 níveis,
  arena 15×13 a 20 passos/s, bombas, corrente, caixas, itens de fogo, velocidade, bomba,
  chute e caveira, itens de quem morre espalhados, arena que fecha (1, 3 ou 5 min) com
  blocos caindo do céu, registro de quem pegou quem com KDA no fim, revanche, chat, queda
  com bot ao volante.
- Controles: teclado (setas/WASD + espaço) e toque (direcional + botão de bomba).
- Testes: motor, bot (com simulação de partidas inteiras conferindo invariantes), sala,
  servidor de ponta a ponta, contrato do Redis (só com `REDIS_URL`).
- No ar em <https://omi-bomba.imp-software.cloud> desde 03/11/2026 (primeiro deploy
  `6d01cc9`). `DEPLOY_ENABLED=true`: push em `main` com CI verde publica sozinho. Sonda
  interna de minuto e sonda externa (Synthetic Monitoring) ativas.

## Próximos passos

1. Jogar com gente de verdade e ajustar números (pavio, velocidade, densidade de caixas).
2. Itens novos, um por vez (ex.: bomba extra), cada um como RN em `docs/regras.md`.
3. Predição de movimento no cliente se a latência incomodar (ADR-O02).

## Como verificar

```bash
npm install && npm run typecheck && npm test
npm run build:client && npm start   # http://localhost:3000
```
