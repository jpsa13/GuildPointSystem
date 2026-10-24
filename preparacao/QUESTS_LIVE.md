# Monitor local e catálogo Coupon

**Seleção atual:** [catálogo Cora e layout compacto](QUESTS_CORA.md) substituem a lista multirracial descrita abaixo.


Atualização de 23/10/2026; substitui as restrições de identificação e envio real da candidata de replay descrita em QUESTS.md. Não houve deploy.

## Uso

1. Execute o site e o backend com a configuração local de quests e banco isolado. A ingestão real exige profile `quests-local` e `guild.quests.live-enabled=true`; fica desabilitada na configuração padrão.
2. Faça login, abra `/quests`, informe o nome exato do personagem no pareamento e copie o token exibido uma vez.
3. Com Python 3 instalado e exatamente um cliente Stage Era 4 GB aberto, execute da raiz do GuildPointSystem:

```powershell
.\CerberusQuests\Start-SiteMonitor.ps1 -ClientPath 'F:\RF Cerberus - Stage Era'
```

Cole o token no prompt protegido. Ele não vai para argumentos, código ou fila. Um novo pareamento revoga os anteriores desse membro. Troca de personagem/conexão ou leitura inválida encerra o monitor; faça novo pareamento. Falhas de rede preservam a fila e os IDs em `outputs/monitor-local-*.json`; preserve esses arquivos para reenvio. Não publique filas, logs ou tokens.

O monitor externo usa apenas leitura do processo: valida caminho e SHA256 do cliente, identidade antes/depois da leitura e os 424 bytes das definições contra Quest.edf. Nome, serial e época da conexão vinculam a sessão; nível e XP são validados. A identidade permanece observada no cliente e associada por declaração do jogador, sem atestação do servidor RF. Não instala DLL, injeta código ou concede pontos.

## Catálogo esperado

`Store.edf` identifica os NPCs Coupon Reward Manager 2, 3 e 4. `NDStore.edf` fornece seus nomes. As sete seções de ofertas do `Quest.edf` contêm três alternativas por registro, todas consideradas. A seção de definições e `NDQuest.edf` fornecem títulos e objetivos. O catálogo comprimido contém somente metadados; EDFs e registros binários não acompanham o repositório.

| NPC | Códigos Store | Quests distintas |
| --- | --- | ---: |
| Coupon Reward Manager 2 | 050B7, 050B8, 050B9 | 68 |
| Coupon Reward Manager 3 | 050C1, 050C2, 050C3 | 40 |
| Coupon Reward Manager 4 | 060C1, 060C2, 060C3 | 0 |

As 180 relações NPC/quest se consolidam em 108 entradas por definição e nome de NPC, com raças agrupadas. Manager 4 existe em Store.edf, mas não tem ofertas vinculadas neste Quest.edf. A tela informa isso. Não há presunção de frequência diária, cooldown ou elegibilidade pelo título. Administradores podem ocultar/restaurar entradas globais; a auditoria registra apenas código e visibilidade. Histórico e estatísticas do jogador continuam privados, inclusive para administradores.

Para reconstruir ambos os catálogos com os EDFs compatíveis instalados:

```powershell
python CerberusQuests/tools/extract_coupon_catalog.py --out backend/src/main/resources/quest/coupon-catalog.json.gz
```

## Validação e limite atual

Leitura real conferida com o jogador: meow, nível 55, XP 0%, 20 quests presentes. O site recebeu os dados pelo monitor e atualizou por WebSocket. O fluxo HTTP validou privacidade entre contas, ocultação por administrador e recusa para membro comum. A demonstração usa o cadastro fictício Teste Lider, sem renomear o cadastro para o personagem.

A checklist marca apenas sinais reais de conclusão no período selecionado; simulações não contam. Estado alterado sem detector validado é `STATE_CHANGED`; desaparecimento é `REMOVED_UNKNOWN`. Ausência de sinal não prova que a quest não foi feita. Os três códigos previamente testados e Q071396 podem emitir `COMPLETION_SIGNAL`. A Q071396 ([24h] Easy Cartella Quest Reward 1) foi aceita e entregue com confirmação do jogador: grupo 1/tipo 1, slot 8 → 111 (+103). A transição original STATE_CHANGED continua imutável e é reconhecida na contagem da checklist com código, hashes e continuidade exatos. Os demais itens Coupon ainda precisam de observação controlada antes de ampliar o detector. Reset: 03:00 America/Sao_Paulo; janela de reset e dia civil permanecem distintos.

Validações: suíte Java completa com 95 testes; após os últimos ajustes de continuidade/repareamento, 17 testes de integração de quests passaram. Frontend com 160 testes, build e lint dos arquivos alterados; dez testes Python. Migrations aditivas V67 e V68 na candidata original; nesta integração são V68 e V69. Não há confirmação autoritativa de conclusão pelo servidor RF; polling pode perder transições rápidas.

O lint global do frontend ainda acusa 19 erros e dois avisos em módulos preexistentes fora de quests; o lint dos arquivos alterados passou.
