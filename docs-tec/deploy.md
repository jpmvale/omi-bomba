# Deploy

Segue o guia `vps-infra/docs/guia-novo-projeto.md` (§9).

## Topologia

```
Caddy (edge) ── omi-bomba.imp-software.cloud ──▶ omi-bomba-api:3000  (cliente + API + WebSocket)
                                                     │ rede do projeto
                                                     ▼
                                                 omi-bomba-redis (sem persistência)
```

- Imagem `ghcr.io/jpmvale/omi-bomba-api:<sha curto>` (e `:latest`).
- Compose: `docker-compose.yml` (base) + `docker-compose.prod.yml` (overlay, `!override`
  nas portas). Nenhuma porta publicada no host.
- `/api/health` → `{ ok, version, protocolVersion, rooms }`; a raiz responde 200.
- CSP própria com nonce: o bloco do Caddy **não** importa `csp_em_vigor`.

## Esteira

`push` em `main` → **CI** (typecheck, build, bundle ≤ 180 KB gzip, `npm audit`, testes com
Redis de verdade, travas de fronteira, `docker build`) → **Deploy** (só com
`DEPLOY_ENABLED=true`): constrói e empurra a imagem e chama, por SSH com chave dedicada
presa ao `deploy.sh`, `omi-bomba <sha>`.

| tipo | nome | valor |
|---|---|---|
| secret | `VPS_HOST` | host da VPS |
| secret | `VPS_DEPLOY_KEY` | chave privada dedicada (`~/.ssh/id_omi-bomba_deploy`) |
| secret | `VPS_HOST_KEY` | linha do `known_hosts` da VPS |
| variable | `DEPLOY_ENABLED` | `true` depois do primeiro deploy manual |

## Primeiro deploy (uma vez)

1. **DNS**: registro A `omi-bomba` → IP da VPS.
2. **vps-infra**: PR com o caso `omi-bomba` no `bin/deploy.sh`, o bloco do Caddy
   (`deploy/Caddyfile`), a linha do `checkup-apps.conf`, a sonda no crontab, o `NOVOS` das
   sondas externas e o `.env` no backup de segredos. Aplicar na VPS.
3. **Clone**: `git clone https://github.com/jpmvale/omi-bomba ~/apps/omi-bomba`.
4. **`.env`** em `~/apps/omi-bomba/.env` (modo 600):
   `OMI_BOMBA_SESSION_SECRET=$(openssl rand -base64 48)`.
5. **Chave de deploy** dedicada no `authorized_keys` com o forced command do `deploy.sh`;
   secrets no repositório.
6. **Redis uma vez**: o `deploy.sh` sobe só a `api` com `--no-deps`, então o Redis
   nasce à mão no primeiro deploy:
   `cd ~/apps/omi-bomba && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d redis`.
7. Rodar o **Deploy** à mão (`workflow_dispatch`). Conferir a visibilidade do pacote no GHCR
   (guia §7.4) e `curl https://omi-bomba.imp-software.cloud/api/health`.
8. Ligar `DEPLOY_ENABLED=true`.
