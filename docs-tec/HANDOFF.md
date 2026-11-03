# HANDOFF

## Estado

- Jogo jogável de ponta a ponta: sala com link, escolha de personagem, bots em 3 níveis,
  arena 15×13 a 20 passos/s, bombas, corrente, caixas, itens de fogo e velocidade, arena
  que fecha em espiral, rodadas e partida, revanche, chat, queda com bot ao volante.
- Controles: teclado (setas/WASD + espaço) e toque (direcional + botão de bomba).
- Testes: motor, bot (com simulação de partidas inteiras conferindo invariantes), sala,
  servidor de ponta a ponta, contrato do Redis (só com `REDIS_URL`).
- Ainda não publicado: falta o repositório no GitHub, o PR no `vps-infra` e o primeiro
  deploy (ver `deploy.md`).

## Próximos passos

1. Primeiro deploy e `DEPLOY_ENABLED`.
2. Jogar com gente de verdade e ajustar números (pavio, velocidade, densidade de caixas).
3. Itens novos, um por vez (ex.: bomba extra), cada um como RN em `docs/regras.md`.
4. Predição de movimento no cliente se a latência incomodar (ADR-O02).

## Como verificar

```bash
npm install && npm run typecheck && npm test
npm run build:client && npm start   # http://localhost:3000
```
