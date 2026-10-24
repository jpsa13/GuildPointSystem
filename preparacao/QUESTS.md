# Acompanhamento de quests — candidata local

**Atualização:** o monitor local de personagem, nível, XP e catálogo Coupon está descrito em [QUESTS_LIVE.md](QUESTS_LIVE.md). As restrições abaixo sobre ausência de identificação/envio real descrevem a etapa anterior de replay.

Base: `origin/main` 04f1be6, após integração do PR 9; cópias locais limpas antes da mudança. O site publicado não foi usado para validar a candidata. Nenhum arquivo de plano é alterado.

## Arquitetura e escopo definido

O login atual retorna um MemberPrincipal com ID de Member. Member concentra credenciais, Discord, nickname, raça e classe; não existe vínculo de propriedade de personagens alternativos. Portanto `/quests` consulta apenas o próprio membro autenticado. Nenhum parâmetro permite escolher outro membro, inclusive para administradores. Suporte a outras contas/personagens exige uma relação de propriedade explícita futura.

Backend por funcionalidade: DTOs, service e repository JDBC, como equipamentos. Migration V67 aditiva nesta integração (V66 na candidata original). Histórico de eventos imutáveis em UTC, agrupado por execução, identidade composta de código + hash do cliente + hash do Quest.edf + hash dos 424 bytes da definição. Título é apenas apresentação. HTTP carrega a tela e recupera reconexões; WebSocket compartilhado envia somente invalidação num tópico privado por membro, com autorização de assinatura.

Pareamento local de simulação: login existente cria sessão e segredo aleatório de 256 bits mostrado uma vez. Banco guarda só SHA256; sessão dura 24h e pode ser revogada pelo dono. Ingestão não aceita memberId; proprietário vem da sessão, com status/perfil revalidados. Token só serve para essa ingestão, nunca para login ou leitura. Sessão e eventos declaram SIMULATION; ingestão/criação ficam desabilitadas por padrão e exigem profile `quests-local` + `guild.quests.simulation-enabled=true`. Não há ingestão de jogo real nesta candidata: falta resolver a identidade do personagem. Versão declarada do emissor não é atestação criptográfica do executável.

Contrato: lote com até 100 eventos; eventId UUID estável, runId UUID por execução observada, sequence contígua a partir de 0, occurredAt UTC, código, título opcional, três hashes, grupo/tipo e slot. Estados emitidos: PRESENT, COMPLETION_SIGNAL, REMOVED_UNKNOWN. Remoção sem sinal nunca significa abandono. Objetivos cumpridos, falha e abandono não são inferidos sem detector validado. COMPLETION_SIGNAL significa apenas transição correlacionada com conclusão nos três casos validados; não é confirmação do servidor RF. Idempotência por sessão/eventId e sessão/runId/sequence; mesmo ID com conteúdo diferente retorna conflito. Leituras repetidas não geram novo sinal; reenvio conserva IDs. Execuções diferentes usam runId diferente após remoção, sem deduplicar por código/dia. Lacunas e troca de sessão interrompem continuidade: nunca inferir conclusão cruzando esses limites.

Replay offline verifica os 424 bytes contra EDF e não transmite binários ou endereços. Catálogo não exige cadastro manual: código obtido da definição; título inválido usa código. Grupo 1/tipo 1 aparece como candidato NPC, exceto Q071356/Q071396 validadas; outros mapeamentos permanecem incertos. Fila é o JSON persistido antes do envio: reenvio integral é seguro, arquivo nunca é apagado automaticamente. Replays de personagens diferentes precisam de sessões distintas. Não há vínculo confiável desses logs históricos a uma conta; toda exibição é simulação.

## Regras pendentes (não bloqueiam histórico)

- Reset confirmado pelo usuário: 03:00 Brasília / 09:00 Moscou. Permanecem pendentes quests esperadas, elegíveis não aceitas, regras únicas/repetíveis e eventual configuração administrativa.
- O usuário deixou a escolha de pareamento a critério da implementação. Decisão: envio real aguarda identidade/troca de personagem validadas; confirmação declarada isolada não detecta troca dentro do jogo.
- Relação entre uma conta e personagens alternativos; eventual visibilidade a liderança.

A tela usa America/Sao_Paulo e distingue dia civil de janela de reset (03h até 03h seguinte). O reset informado não classifica todas as quests como diárias. Prefixos [3h]/[24h] não calculam disponibilidade. Sem observações não significa quest não realizada. Não há pontos, recompensas, ajustes administrativos ou publicação em auditoria pública; caso ajustes sejam aprovados deverão usar AuditLogService com privacidade preservada.

## Validação

Fixtures são simulação, inclusive quando derivadas de logs reais. Não instalar/rodar novo monitor no cliente nem aplicar migrations em bancos existentes. Falha, cadeia, repetição no jogo e identificação automática continuam exigindo testes específicos. Polling pode perder sinais rápidos; leitura externa não oferece garantia contra anticheat.

Resultados executados em 23/10/2026:

- Maven `verify`: 90 testes passaram no banco novo `127.0.0.1:15433/guild_quests_candidate_20261023`. Depois do limite de cinco sessões ativas, `verify -Dtest=QuestIntegrationTest`: 11 testes passaram. Incluem idempotência, corrida entre reenvios, rollback de lote, novo run legítimo, privacidade HTTP/WebSocket (incluindo wildcard), revogação, expiração, limites e recorte temporal às 03h. Logs em `preparacao/evidencias/quests-verify.log` e `quests-focused-verify.log` (ignorados).
- Frontend: build, lint dos arquivos novos e 158 testes passaram. Cobertura nova de reconexão, atualização por WebSocket, separação de cache por conta e rótulos de incerteza/simulação. O build mantém o aviso já existente de chunks maiores que 500 kB.
- Python `python -m unittest discover -s CerberusQuests/tests -p test_replay_site.py -v`: cinco testes passaram; cenários sintéticos de repetição, lacuna, remoção, ID estável, delta +103, caso não validado e recusa de destino remoto.
- Dados reais lidos offline: catálogo de 4.440 definições; log `20261023-200922-48220` gerou 23 observações (21 presenças, um sinal e uma remoção); log `20261023-201253-28032` gerou 22 (21 presenças, uma remoção, zero sinais). Os dois foram enviados apenas como SIMULATION, a contas fictícias distintas. A identidade real desses personagens não foi atribuída às contas.
- `python CerberusQuests/tools/check_site_local.py`: fluxo HTTP completo com login local, pareamento, reenvio integral sem duplicação, separação entre contas, histórico por período e rejeição após revogação. Evidência sanitizada em `../outputs/quests-site-smoke.json` relativamente ao repositório.
- Tela aberta e conferida no navegador integrado. Evidência: `../outputs/quests-preview.png`. Nenhum teste novo dentro do jogo foi executado; C++/binário diagnóstico, rf-ui, CerberusBags e arquivos do cliente não foram modificados.

## Prévia desta máquina

Frontend: http://127.0.0.1:15175/quests. Backend: http://127.0.0.1:18082/actuator/health.
Contas do seed fictício, somente neste banco novo: `teste@teste.com.br` e `teste2@teste.com.br`, senha `123456`. A primeira mostra o replay de conclusão; a segunda, o replay de remoção sem conclusão. Sessões do smoke foram revogadas ao terminar; histórico é preservado.

Configurações explícitas: `preparacao/application-quests-local.yml` e `frontend/vite.quests-local.config.ts`. Backend iniciou com o JAR compilado, profile `quests-local`, config location exclusiva e Discord/alertas desativados. PIDs e logs em `preparacao/evidencias/quests-{backend,frontend}.*`; binds apenas 127.0.0.1. Os listeners 15173/18080 e 15174/18081 não foram reiniciados. A instrução local genérica de reiniciar 8080 cede à instrução do usuário de preservar ambientes e conferir bancos: a candidata usa porta e banco próprios. Nenhuma migration aplicada foi editada.

Para frontend: `npm run dev -- --config vite.quests-local.config.ts` dentro de `frontend` (não repetir enquanto a porta estiver ocupada). O backend usa Java 21 portátil já instalado em `C:/Windows/Temp/guild-equipment-pr-validation/jdk`; Maven/cache já existentes da mesma validação. O JAR foi iniciado com `--spring.config.location=file:../preparacao/application-quests-local.yml --spring.config.import= --spring.profiles.active=quests-local` a partir de `backend`, com o fallback TCP do JDK já utilizado nos outros ambientes. Não iniciar usando configuração padrão ou `.env` de produção.

Replay e comandos: `../CerberusQuests/INTEGRACAO_SITE.txt` relativamente ao repositório. Reenvio precisa da mesma sessão e mesmo arquivo; uma sessão recriada representa outra origem e não deduplica a anterior. A tela apresenta execuções observadas no período; quests não observadas, identidade do jogador, disponibilidade e monitoramento ao vivo não são inventados. As presenças antigas não garantem o estado atual após lacunas. O contador é parcial enquanto houver páginas por carregar.

Sem deploy, merge, push ou PR. Candidata na branch `codex/acompanhamento-quests`, com alterações locais para revisão.
