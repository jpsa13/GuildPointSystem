# Guild Points System — RF Online

Sistema web de gestão de pontos de guild (monorepo React + Spring Boot + PostgreSQL).

## Pré-requisitos

- Node.js 20+
- **JDK 21** ([Eclipse Temurin](https://adoptium.net/) — marque "Add to PATH" na instalação)
- Docker Desktop (PostgreSQL) **ou** PostgreSQL 16 instalado localmente

## Setup rápido (Git Bash)

```bash
cd ~/OneDrive/Desktop/GuildPointSystem

# Primeira vez ou se o banco falhou na migration:
chmod +x scripts/*.sh backend/mvnw
./scripts/dev.sh

# Outro terminal — frontend:
./scripts/start-frontend.sh
```

Comandos individuais:

```bash
source scripts/dev-env.sh          # JDK 21 na sessão
./scripts/start-backend.sh       # Docker + backend
./scripts/start-backend.sh --reset-db   # apaga volume Postgres e recria
./scripts/start-frontend.sh      # Vite :5173
```

### Problemas comuns (Windows)

| Erro | Solução |
|---|---|
| `mvn: command not found` | Use `./mvnw` (Git Bash) ou `mvnw.cmd` (PowerShell) — Maven global não é necessário |
| `java: command not found` | Instale JDK 21 e reinicie o terminal |
| Docker `dockerDesktopLinuxEngine` | Abra o **Docker Desktop** e espere ficar "running" |

## Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `DISCORD_CLIENT_ID` | OAuth Discord |
| `DISCORD_CLIENT_SECRET` | OAuth Discord |
| `DISCORD_BOT_TOKEN` | Bot da lista de membros do Dashboard (vazio = desligado) |
| `DISCORD_GUILD_ID` | Servidor do Discord (opcional) |
| `DISCORD_MEMBER_ROLES` | Cargos exibidos (padrão `Leader,Cerberus`) |
| `OAUTH_FRONTEND_URL` | URL do frontend após login Discord (prod: `https://blacklist.guildsystem.com.br`) |
| `JWT_SECRET` | Chave JWT (min. 256 bits) |
| `CORS_ORIGINS` | Origens permitidas (default dev: `http://localhost:5173`) |

Produção: ver [`deploy/coolify.env.example`](deploy/coolify.env.example) (backend) e [`deploy/vercel.env.example`](deploy/vercel.env.example) (frontend).

## Produção

| Serviço | URL |
|---|---|
| Frontend | https://blacklist.guildsystem.com.br |
| API | https://backend.guildsystem.com.br/api |
| WebSocket | https://backend.guildsystem.com.br/ws |

Deploy completo: [`deploy/DEPLOY.md`](deploy/DEPLOY.md)

## Documentação

- Especificação: [`especificacao-guild-points-rf-online.md`](especificacao-guild-points-rf-online.md)
- Guia do agente: [`AGENTS.md`](AGENTS.md)
- Regras Cursor: [`.cursor/rules/`](.cursor/rules/)
- Skills: [`.cursor/skills/`](.cursor/skills/)

## Testes

```bash
cd backend && ./mvnw test
cd frontend && npm run test
```

## API

- REST: `http://localhost:8080/api`
- WebSocket STOMP: `http://localhost:8080/ws`
- Health: `http://localhost:8080/actuator/health`
