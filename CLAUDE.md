# OmiBomba — guia para o Claude Code

Jogo de bombas em grade no navegador, com salas de até 5 pessoas, link de convite e bots.
Regras em [`docs/regras.md`](docs/regras.md) (RN-*); decisões técnicas em
[`docs-tec/decisoes-tecnicas.md`](docs-tec/decisoes-tecnicas.md) (ADR-O*).
Infra e operação seguem o guia `vps-infra/docs/guia-novo-projeto.md`.

## Como trabalhar aqui

1. **Gerenciador de pacotes:** `npm` (workspaces), como o Dominó e o FDP.
2. **Idioma:** documentação, código de domínio, commits e conversa em pt-BR.
3. **Commits:** `tipo: frase` curta em português, com corpo dizendo o porquê.
4. **O motor é puro:** `packages/rules` não lê relógio nem sorteia sozinho; tempo e acaso
   entram por parâmetro (o CI confere). Posições são inteiras (ADR-O03).
5. **O servidor é a autoridade:** o cliente não importa `room`, `bot` nem `store`.
6. **Original:** arte, nomes e personagens são próprios. Não copiar jogo existente.
7. **Antes de commitar:** `npm run typecheck && npm test`.
8. **Decidir junto:** opções com trade-offs e uma recomendação; decisão fechada vira
   ADR/RN no mesmo commit.
9. **Produção:** push em `main` com CI verde publica sozinho. Ver `docs-tec/deploy.md`.

## Estado atual

Leia [`docs-tec/HANDOFF.md`](docs-tec/HANDOFF.md).
