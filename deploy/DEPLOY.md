# Guild Points — Production Deploy Guide

Split deploy: **Vercel** (frontend) + **Hostinger VPS KVM 2** (backend + PostgreSQL) with **Coolify** for backend CI/CD.

## Architecture

| Host | Service |
|------|---------|
| `blacklist.guildsystem.com.br` | React SPA (Vercel) |
| `backend.guildsystem.com.br` | Spring Boot + STOMP `/ws` + uploads (VPS) |

DNS is managed on **Vercel** (nameservers `ns1.vercel-dns.com` / `ns2.vercel-dns.com`).

---

## 1. VPS — Hostinger KVM 2 (São Paulo)

1. Order **KVM 2** (2 vCPU, 8 GB RAM).
2. **Location:** São Paulo, Brasil (latency for BR users).
3. **OS:** Ubuntu 24.04 LTS — tab **SO simples**.
4. **Panel:** Coolify — tab **Painel de controle** (install via Hostinger template or [coolify.io](https://coolify.io/docs/get-started/installation)).
5. Note the VPS **public IP** for DNS.

Access day-to-day:

- Coolify web UI (deploy, logs, env vars, SSL).
- SSH from Windows: `ssh root@<vps-ip>` (PowerShell or PuTTY).
- Hostinger Web Terminal in hPanel.

Do **not** use Windows RDP — Linux + Docker is the intended stack.

---

## 2. DNS (Vercel)

At [vercel.com](https://vercel.com) → **Domains** → `guildsystem.com.br` → **DNS Records**:

| Record | Type | Value |
|--------|------|-------|
| `blacklist` | CNAME / auto | Vercel frontend project |
| `backend` | A | VPS public IP |

Wait for propagation (often 5–30 min). SSL is automatic on Vercel and Coolify (Let's Encrypt).

---

## 3. Coolify — Backend + PostgreSQL

### Party (LFG / PT)

Se Party falhar só em produção, veja [party-prod-flyway.md](party-prod-flyway.md) (conflito Flyway `V23` + migration `V24`).

### Troubleshooting healthcheck

If deploy builds but healthcheck fails (`Could not connect to localhost:8080`):

1. Open **Logs** on the backend container — look for Flyway/PostgreSQL or `JWT_SECRET` errors.
2. Confirm `SPRING_DATASOURCE_URL` uses the **internal** Postgres hostname (e.g. `guild-postgres`), not `localhost`.
3. Confirm required env vars are set: `JWT_SECRET`, `CORS_ORIGINS`, `SPRING_DATASOURCE_*`.
4. For Discord login, use `SPRING_PROFILES_ACTIVE=prod,discord` and set `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET`.
5. Mount persistent storage at `/data/uploads` on the backend container.

### PostgreSQL

1. Coolify → **+ New** → **Database** → **PostgreSQL 16**.
2. Database name: `guild_points`, user: `guild`, strong password.
3. Note internal hostname (e.g. `guild-postgres`).

### Backend application

1. **+ New** → **Application** → **Public Git** → your GitHub repo.
2. Branch: `main`.
3. **Build pack:** Dockerfile.
4. **Base directory:** `backend`.
5. **Domains:** `backend.guildsystem.com.br` → enable HTTPS.
6. **Persistent storage:** mount volume at `/data/uploads`.
7. **Environment variables** — copy from [`deploy/coolify.env.example`](coolify.env.example):

   | Variable | Valor |
   |----------|-------|
   | `SPRING_PROFILES_ACTIVE` | `prod,discord` |
   | `SPRING_DATASOURCE_URL` | `jdbc:postgresql://<postgres-host>:5432/guild_points` |
   | `JWT_SECRET` | `openssl rand -base64 48` |
   | `CORS_ORIGINS` | `https://blacklist.guildsystem.com.br` |
   | `OAUTH_FRONTEND_URL` | `https://blacklist.guildsystem.com.br` |
   | `DISCORD_CLIENT_ID` | Client ID do Discord |
   | `DISCORD_CLIENT_SECRET` | Client Secret do Discord |
   | `DISCORD_BOT_TOKEN` | Token do bot (lista de membros no Dashboard) |
   | `DISCORD_GUILD_ID` | ID do servidor do Discord (opcional) |

8. **Auto Deploy:** enable webhook on push to `main`.

Alternative reference stack: [`deploy/docker-compose.prod.yml`](docker-compose.prod.yml).

### WebSocket

Coolify/Caddy proxies WebSocket upgrades by default. After deploy, verify `https://backend.guildsystem.com.br/ws/info` returns SockJS info JSON.

The frontend connects with a native WebSocket to `/ws/websocket` and falls back to SockJS only if that fails. The `/ws` endpoint accepts only the origins in `CORS_ORIGINS`, so a wrong value there rejects every socket.

### Metrics (realtime health)

`/actuator/metrics` is restricted to Administrador/Líder: call it with a leader's JWT (`Authorization: Bearer …`, the token the app stores after login). Percentiles cover roughly the last 2 minutes.

| Metric | What it tells you |
|---|---|
| `guild.auction.bid?tag=outcome:accepted` / `rejected` / `error` | WS bid end to end (row-lock wait, commit, fan-out), as the bidder feels it |
| `guild.auction.bid.percentile?tag=phi:0.95` | p95 of the above (also `0.5`, `0.99`) |
| `guild.party.board.broadcast` | Time to build and push the party board to everyone |
| `guild.websocket.sessions?tag=transport:all` | Open sockets (`websocket` = native, `sockjs-*` = fallback) |
| `guild.websocket.sessions.limit-exceeded` | Sockets closed for being too slow to receive |
| `executor.queued?tag=name:clientInboundChannelExecutor` | STOMP frames waiting for a thread (should stay ~0) |
| `hikaricp.connections.pending` | Requests waiting for a DB connection (should stay ~0; raise `DB_POOL_SIZE` if not) |
| `http.server.requests.percentile?tag=phi:0.95` | REST p95 (filter further with `&tag=uri:/api/...`) |

---

## 4. Vercel — Frontend

1. [vercel.com](https://vercel.com) → **Add New Project** → import GitHub repo.
2. **Root Directory:** `frontend`.
3. Framework: Vite (auto-detected; [`frontend/vercel.json`](../frontend/vercel.json) included).
4. **Environment variables** (Production) — copy from [`deploy/vercel.env.example`](vercel.env.example):

   | Variable | Value |
   |----------|-------|
   | `VITE_API_BASE_URL` | `https://backend.guildsystem.com.br/api` |
   | `VITE_WS_BASE_URL` | `https://backend.guildsystem.com.br` |

5. **Domains:** add `blacklist.guildsystem.com.br`.
6. Production branch: `main` → auto deploy on push.

Local dev: leave env vars unset; Vite proxy handles `/api`, `/ws`, `/oauth2` and `/login`.

---

## 5. Discord OAuth

1. [Discord Developer Portal](https://discord.com/developers/applications) → your app → **OAuth2**.
2. **Redirects** — add exactly:

   ```
   https://backend.guildsystem.com.br/login/oauth2/code/discord
   ```

   (Dev local: `http://localhost:8080/login/oauth2/code/discord`)

3. Copy **Client ID** and **Client Secret** into Coolify env vars (`DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`).
4. Ensure `OAUTH_FRONTEND_URL=https://blacklist.guildsystem.com.br` is set on the backend.

**Flow:** user clicks Discord on frontend → `backend.guildsystem.com.br/oauth2/authorization/discord` → Discord → backend callback → redirect to `blacklist.guildsystem.com.br/auth/callback?token=...`

---

## 6. CI (GitHub Actions)

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs tests on push/PR. Coolify and Vercel deploy independently on push to `main` after merge.

---

## 7. Validation

Run after DNS and both deploys are live:

```powershell
# Windows (defaults to guildsystem.com.br hosts)
.\deploy\validate-prod.ps1
```

```bash
# Linux / macOS / VPS
./deploy/validate-prod.sh
```

Manual checks:

1. `https://blacklist.guildsystem.com.br` loads SPA.
2. Register/login and Discord OAuth work.
3. DevTools → Network → WS connects to `backend.guildsystem.com.br/ws`.
4. Auction bids update in real time for multiple users.
5. Upload item image → survives backend container restart.
6. Push to `main` → Vercel + Coolify redeploy without SSH.

---

## 8. Secrets checklist

Never commit:

- `JWT_SECRET`
- `POSTGRES_PASSWORD` / `SPRING_DATASOURCE_PASSWORD`
- `DISCORD_CLIENT_SECRET`

Generate JWT secret:

```bash
openssl rand -base64 48
```
