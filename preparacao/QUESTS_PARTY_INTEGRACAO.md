# Integração de quests e chamadas de PT

Consolida o módulo do [RF-ui PR #1](https://github.com/jpsa13/RF-ui/pull/1), snapshot `4106a60`, e as chamadas de PT no Discord sobre o GuildPointSystem. Preserva a dashboard e a ingestão de status do personagem já presentes no upstream.

## Conteúdo

- `/quests`: pareamento privado, journal observado, histórico por dia e checklist Cora com catálogo e visibilidade administrável.
- `CerberusQuests/`: monitor externo Python, somente leitura, com validação da versão do cliente/EDFs, identidade, continuidade, fila persistente e reenvio idempotente. Requer Python 3 e o cliente compatível instalado pelo usuário.
- `/party`: chamadas pelo bot existente no início, em 2min30s e em 5min. A reação ✅ do destinatário cancela suas próximas menções. Apenas o líder da PT ou um administrador inicia uma rodada; confirmações, cooldown e falhas são persistidos.
- `app/` e `downloads/`: pacote portátil trazido do RF-ui, separado do monitor, com os mesmos DLLs, INIs e licenças. Não é uma nova compilação das DLLs nem inclui as candidatas posteriores de bags.

## Banco e implantação

O upstream continha dois arquivos V65: equipamentos e status do personagem. Esta integração mantém `V65__equipment_weapon_types.sql` e renumera **somente o arquivo** de status para V66, sem alterar seu SQL. Quests passa a V67–V69 e as chamadas Discord usam V70.

Antes de implantar, confira `flyway_schema_history` no banco de destino. O caminho validado é um banco novo ou um histórico com V65 de equipamentos e sem as migrations locais de quests. Se V65 de status ou V66–V69 locais já tiverem sido aplicadas, é necessário reconciliar esse histórico especificamente; não executar `repair`, apagar registros ou reaplicar SQL automaticamente. Este PR não modifica nenhum banco de produção.

Quests real e replay continuam desabilitados por padrão. A ingestão real exige o profile `quests-local` e `guild.quests.live-enabled=true`. Use o exemplo `application-quests-local.yml` apenas com banco isolado, fornecendo `QUESTS_DB_URL`, `QUESTS_DB_USERNAME`, `QUESTS_DB_PASSWORD` e `QUESTS_JWT_SECRET` no ambiente. Não reutilize o banco de uma candidata com a numeração antiga.

Para Discord, configure `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID` e `DISCORD_PARTY_CHANNEL_ID` no ambiente de implantação. Sem configuração, o botão informa indisponibilidade. Conceda ao bot acesso ao canal, envio, histórico e reações. O canal deve herdar as permissões da categoria CHATS. Desligue as chamadas locais antes de ativá-las em produção para a mesma comunidade. Não há token no repositório.

## Verificação

```sh
cd backend
./mvnw verify  # PostgreSQL de teste configurado por SPRING_DATASOURCE_*
cd ../frontend
npm ci
npm test
npm run build
cd ..
python -m unittest discover -s CerberusQuests/tests -p 'test_*.py'
python -m unittest discover -s app/tests -p 'test_*.py'
```

Os diagnósticos C++ históricos em `CerberusQuests/src` são opcionais; `build.ps1` usa uma instalação local de w64devkit não distribuída. O monitor integrado é `Start-SiteMonitor.ps1` + Python e não depende dessa compilação.

Validação da consolidação: 107 testes Java, 167 testes frontend, 11 testes Python do monitor e um teste do ZIP passaram. Build do backend/frontend e lint dos arquivos TypeScript alterados passaram. As migrations foram aplicadas em um banco vazio separado. Os hashes do payload preparado no Git coincidem com o manifesto, inclusive os INIs. O build frontend mantém avisos de chunks acima de 500 kB.

Backend iniciado na porta local 8080 com banco isolado e bot desabilitado; `/actuator/health` retornou `UP`. O serviço local existente na porta 18082 e seu banco foram preservados. Não foi realizado deploy em produção.

Leitura do cliente não equivale a confirmação autoritativa do servidor RF. Só as transições já validadas contam como sinal de conclusão; outras mudanças ficam indeterminadas. Polling pode perder transições rápidas. Uma rodada real de três chamadas com jogadores e sua reação deve ser conferida antes de ativar produção; testes automatizados usam Discord simulado.
