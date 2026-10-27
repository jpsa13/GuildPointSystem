# Guild Points System — RF Online

Sistema web de gestão de pontos de guild (monorepo React + Spring Boot + PostgreSQL).

## Rotação de bosses

Menu **Rotação**, rota `/rotation`: agenda diária com horários de Brasília/Moscou/Jacarta, divisão QG/Outpost, guildas identificadas por cor, filtro e totais calculados. Membros aprovados consultam; Administrador/Líder edita horários e atribuições, com auditoria e proteção contra sobrescrita concorrente. EXP aguarda conteúdo. API `/api/rotation/bosses`, migração aditiva V72.

A versão local unificada usa **http://127.0.0.1:15177**, backend **18084**. Esta cópia (`GuildPointSystem-gearscore-pr`) é a fonte do site: equipamentos/gear score, quests e rotação. A prévia antiga 15175/18082 foi desativada; não retomar o site aninhado em `RF-ui/GuildPointSystem` como serviço ativo.

### Continuidade local — unificação de 26/10/2026

- Banco preservado: `guild_gearscore_pr_test_20261025`, PostgreSQL local 15433. Histórico de quests transferido por identidade da conta (email/Discord, nunca ID numérico): 162 observações, 7 sessões arquivadas e 94 preferências de visibilidade. Rotação editada também importada. Equipamentos conferidos por contagem e hash antes/depois, sem alterações na transferência.
- Monitor externo incluído em `CerberusQuests`, apontando para 18084. A Sandbox envia pelo diretório compartilhado; somente o relay do host possui token, em memória. O processo local já aberto ainda usa a cópia equivalente em `../RF-ui/CerberusQuests`; novas instalações podem usar somente este repositório. Pareamentos expiram em 24h e precisam ser renovados após expiração; troca de personagem exige novo pareamento.
- Checklist Cora: 15 quests, incluindo Medium+ e extras. Apenas sinais validados de conclusão contam; desaparecimento/`done` do monitor nativo não conclui quests. Status nativo continua disponível como fallback do cabeçalho; integração de equipamentos permanece independente.
- Frontend: `cd frontend; npm run dev -- --config vite.unified-local.config.ts`. Inicializador privado completo desta máquina: `preparacao/start-unified-local.ps1`. Requer PostgreSQL 15433 já iniciado e o runtime Java/configuração privada existentes. Não contém credenciais ou tokens; não é instalador para outro PC.
- Backend executa o JAR compilado desta cópia no runtime local `C:\Windows\Temp\guild-equipment-pr-validation\gearscore-pr-backend`, com profiles `isolado,quests-local`, live habilitado e simulação desabilitada. Depois de recompilar, o inicializador copia o JAR para esse runtime somente com o backend parado.
- Backups dos dois bancos, verificação da migração, logs e capturas: `preparacao/evidencias/unification-20261026` (privado/ignorado pelo Git). Não importar dumps sobre o banco ativo nem executar novamente migrações manuais sem comparar o estado.
- Validação: 79 testes backend, 125 frontend e 21 Python; build e lint dos arquivos alterados aprovados. As 15 conclusões foram cobertas por testes, mas não houve nova conclusão individual de todas elas no jogo nesta unificação.

O PR inclui o monitor Python, sem alterar DLLs/bags. Consulte [operação e revisão da integração](preparacao/UNIFICACAO_SITE.md) para executar em outro checkout e conferir o escopo.

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

## Quests e chamadas de PT

Consulte [integração, configuração e migrations](preparacao/QUESTS_PARTY_INTEGRACAO.md), [monitor local](preparacao/QUESTS_LIVE.md) e [chamadas Discord](preparacao/PARTY_DISCORD.md). O monitor e o pacote portátil foram incorporados do [RF-ui PR #1](https://github.com/jpsa13/RF-ui/pull/1).
