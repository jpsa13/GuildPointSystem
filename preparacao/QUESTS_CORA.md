# Catálogo Cora e checklist compacta

Atualização de 23/10/2026. Substitui a seleção multirracial de QUESTS_LIVE.md; o histórico de observações não foi alterado.

A extração agora cruza identidades de recompensa (tabela + código do item) com todas as ofertas de NPCs e restringe os NPCs ao campo de raça 1 (Cora). A raça do NPC é a evidência de oferta; o byte racial de uma definição compartilhada de quest não substitui essa relação. Muitos códigos Cartella são compartilhados pelas três ofertas raciais, portanto continuam iguais na seleção Cora.

Emblemas identificados nas recompensas das quests Cartella: tabela 20, códigos `C5081622` (Easy), `C5081623` (Medium), `C5081624` (Hard). A quantidade não faz parte da identidade do emblema. A Medium+ também recompensa `C5081623`, em quantidade 20.

| Grupo | Códigos de quest | NPC Cora |
| --- | --- | --- |
| Easy | Q071396–Q071400 | Coupon Reward Manager 2 · 050B8 |
| Easy+ | Q071401–Q071403 | Coupon Reward Manager 2 · 050B8 |
| Medium | Q071404–Q071405 | Coupon Reward Manager 2 · 050B8 |
| Medium+ | Q071382 · Invader Spider | CartellaAssistant · 04121 |
| Hard | Q071406 | Coupon Reward Manager 2 · 050B8 |
| Hard+ | Q071450 | Coupon Reward Manager 2 · 050B8 |
| Chocolate Reward | Q070944 | CouponRewardManager · 04038 |
| Chaos Potion Reward | Q070947 | CouponRewardManager · 04038 |

São 15 quests ativas. Q071449 (Bellato) e Q071451 (Accretia) deixam de integrar esse catálogo. A Q071396 permanece com sua definição/hash original e mantém a conclusão já observada.

O catálogo administrativo Cora possui 63 entradas: 30 do Manager 2 (050B8), 30 do Manager 3 (050C2), uma do CartellaAssistant e duas do CouponRewardManager. Manager 4 (060C2) não tem ofertas neste Quest.edf. As demais 48 entradas ficam ocultas por padrão, com a seleção inicial de 15 quests versionada no código, podendo ser restauradas na administração. O cadastro do site não teve sua raça alterada e a raça do personagem não passa a ser tratada como uma leitura validada do monitor.

A interface usa seis colunas no desktop, extras em uma faixa separada e data no cabeçalho da checklist. Em telas menores, as colunas se reorganizam para manter os controles legíveis. Detalhes, histórico e administração são expansíveis. Os ícones dos extras são neutros até seus assets serem definidos. A classificação de conclusão continua limitada aos casos individualmente validados; incluir uma quest no catálogo não habilita automaticamente um detector de conclusão.

Reconstrução: `python CerberusQuests/tools/extract_coupon_catalog.py --out backend/src/main/resources/quest/coupon-catalog.json.gz`. Os hashes de origem ficam no catálogo. Os EDFs e os registros binários não são publicados.

Validação: 17 testes de integração de quests, sete testes frontend focados, 11 testes Python; build e lint dos arquivos alterados passaram. A extração real conferiu 63 definições com raça de NPC 1 e códigos Cora, rejeitando as variantes Hard+ Bellato/Accretia.

Texto das extras: Q070944 concede uma Gift Chocolate Box (10 pcs.), item da tabela 31, código `510E1786`; Q070947 concede uma Gift Chaos Potion Box (2 pcs.), tabela 31, código `510E0578`. Ambas as definições de Quest.edf têm quantidade 1. As identidades foram localizadas no Item.edf instalado e os nomes/quantidades conferidos na tabela BoxItem exportada. O código da quest permanece nos detalhes; a linha principal mostra o conteúdo da recompensa.
