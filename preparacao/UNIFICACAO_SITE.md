# Site unificado: quests, rotação e equipamentos

Esta revisão parte do `main` que já contém equipamentos/gear score e a lista compacta por classe (PRs #18 e #20). Mantém também as atualizações posteriores de party e agenda. Não modifica código de bags, DLLs ou pacotes nativos.

## Mapa para revisão

- `backend/.../quest`, `frontend/src/Features/Quests` e `Domain/Quest`: catálogo atual, histórico entre versões do EDF, confirmação validada e status do personagem. O status nativo continua como fallback visual; seu `done` por desaparecimento não marca a checklist.
- `CerberusQuests/tools`: leitura externa, validação de hashes e fila persistente. `current_completion.py` lê o mesmo `backend/src/main/resources/quest/completion-current.json` do serviço. `spool_site.py` conecta a fila da Sandbox à API em loopback, com token somente no host.
- `backend/.../rotation`, `frontend/src/Features/Rotation` e `Domain/Rotation`: agenda editável, horários Brasília/Moscou/Jacarta, QG/Outpost, cores, filtro e totais. Membros aprovados consultam; Líder/Administrador publica. Conflitos de edição retornam 409; alterações são auditadas e notificadas por WebSocket. EXP permanece sem agenda.
- `V72__boss_rotation.sql`: migração aditiva com agenda inicial fornecida. Não renumerar para V70: essa versão já existe no repositório de destino.
- `.github/workflows/ci.yml`: inclui os testes Python offline, além das verificações Java/React existentes.

## Executar um checkout do PR

Requisitos: Java 21, Maven, Node e PostgreSQL conforme o README; Python 3 para o monitor (sem dependências adicionais). O leitor real requer Windows e um cliente com hash suportado. Não exige recompilar o app nativo.

Use as variáveis já suportadas pelo backend: `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, `SPRING_DATASOURCE_PASSWORD` e `JWT_SECRET`. Aponte para o banco escolhido, com backup antes de iniciar Flyway. Não copie bancos ou segredos da máquina de desenvolvimento.

Da pasta `backend`, após `mvn package -DskipTests`:

```powershell
java -jar target/app-0.0.1-SNAPSHOT.jar --spring.profiles.active=quests-local --server.address=127.0.0.1 --server.port=18084 --guild.quests.live-enabled=true --guild.quests.simulation-enabled=false --guild.cors.allowed-origins=http://127.0.0.1:15177 --guild.oauth.frontend-url=http://127.0.0.1:15177
```

Da pasta `frontend`: `npm ci` e `npm run dev -- --config vite.unified-local.config.ts`. O site abre em **http://127.0.0.1:15177**. Essa configuração é local; não muda os padrões de produção. O profile `quests-local` e `guild.quests.live-enabled=true` são ambos necessários para habilitar o pareamento real.

Em `/quests`, entre na conta aprovada que receberá o personagem, informe o nome exato e crie o pareamento. Da raiz do repositório:

```powershell
powershell -File CerberusQuests/Start-SiteMonitor.ps1 -ClientPath "F:\RF Cerberus"
```

Informe o token no prompt protegido. Não salve o token em comandos versionados, logs ou arquivos. O pareamento expira em 24h; outro pareamento revoga o anterior. Troca de personagem/conexão exige nova associação. O monitor não inicia automaticamente ao iniciar apenas o site.

### Sandbox

O guest usa `monitor_site.py --pid <PID> --client <executável> --spool-dir <pasta-compartilhada>`. Disponibilize para leitura `CerberusQuests/tools`, `outputs/cerberus-quest-monitor/edf/analyze_edf.py` e `backend/src/main/resources/quest/completion-current.json`, preservando seus caminhos relativos à raiz. Apenas a fila precisa permitir escrita.

No host, execute `python CerberusQuests/tools/spool_site.py --spool-dir <mesma-pasta>` com `QUEST_MONITOR_TOKEN` somente no ambiente desse processo. A API recebe os lotes em 18084. O relay remove um lote apenas após confirmação da API. Ao trocar o destino/sessão, pare o coletor, drene a fila antiga e faça novo pareamento; não reaproveite lotes antigos para outra conta/personagem.

## Dados locais e limites

A consolidação nesta máquina transferiu 162 observações, 7 sessões arquivadas e 94 preferências por email/Discord, sem supor IDs numéricos iguais. A rotação editada foi copiada somente porque o destino ainda estava na versão inicial. Contagens/hashes das tabelas de equipamentos foram preservados. Backups, dumps, tokens e scripts com dados de execução não fazem parte do PR; a migração de histórico entre bancos não roda automaticamente em produção.

O inicializador `start-unified-local.ps1` é específico desta máquina e depende de runtime/configuração privada já existentes. Para outro checkout, use os passos acima. Os serviços antigos 15175/18082 ficaram desativados; o banco antigo foi preservado para recuperação.

As 15 quests Cora usam o perfil de conclusão validado para o cliente atual. A transição de slot `+103`, dentro da mesma execução contínua e contexto permitido, gera uma confirmação única. Remoção, intervalo sem observação, definição desconhecida ou alteração do código nativo não confirmam conclusão. O reset é 03h de Brasília. O perfil foi conferido no caminho nativo compartilhado; as 15 quests têm cobertura automatizada, mas não foram todas concluídas individualmente em teste ao vivo. Não há garantia de recuperação de conclusões ocorridas com o monitor desligado.

## Validação

Na preparação do PR, sobre `main` atualizado: **122 testes Java**, **176 testes frontend** e **21 testes Python** aprovados; `mvn verify` e build frontend concluídos. Os testes Java usaram um banco exclusivo de validação.

```powershell
python -m unittest discover -s CerberusQuests/tests -p 'test_*.py' -v
```

Frontend: `npm run build` e `npm test -- --run`. Backend: `mvn verify`, apontando as variáveis de datasource para **um banco separado de testes**, nunca o banco da prévia com dados de usuários. Testes de equipamento podem persistir fixtures nesse banco.

Verificação manual local: boi identificado com nível/XP, checklist de 15 quests, novas amostras chegando após reiniciar o serviço, fila vazia, agenda editável e ordenação por gear score funcionando na mesma porta 15177.
