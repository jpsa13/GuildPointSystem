# Integração do módulo de equipamentos

Este documento descreve a versão preparada para a `main` em 23/10/2026.

## Comportamento entregue

- F8 abre os equipamentos do próprio membro; Administrador/Líder também acessa Gerenciar players.
- Cada membro edita seu equipamento; administradores editam os demais. Histórico de entregas, alterações e responsáveis é privado no servidor, inclusive na auditoria e no WebSocket.
- Inventário com 12 posições, catálogo por categoria/raça/classe/nível/grade/efeito, ícones e tooltips. A lista administrativa oferece ordenação, seleção de personagens, arraste, repasse, remoção e desfazer/refazer com controle de versão.
- Entregas sem equipar aceitam quantidade de 1 a 100 e preservam um registro por unidade. Repetir a mesma operação não duplica o lote.
- Administradores solicitam revisão em 72h; o membro recebe aviso e confirma a revisão. O prazo não bloqueia lances nesta versão e nenhum fluxo de leilão/pontos foi modificado.

## Banco e publicação

As migrations novas são **V57 a V63**. V55 (suspensão de membros) e V56 (pedidos de entrada em PT cheia) pertencem à `main` e foram preservadas. As migrations de equipamentos originalmente aplicadas apenas no laboratório tinham números V55 a V61; esse banco não deve ser copiado para o site nem receber esta sequência renumerada. Use uma base nova ou a base real que ainda não recebeu o módulo. Não executar Flyway repair para mascarar diferenças de sequência/checksum.

Build e execução de produção continuam usando as configurações existentes do projeto. As configurações, credenciais e scripts de inicialização do laboratório não fazem parte deste PR.

As migrations criam a estrutura. O catálogo agora acompanha o backend em `backend/src/main/resources/equipment-catalog.json.gz`, portanto entra no JAR e na imagem Docker. Na primeira inicialização fora do perfil `test`, o backend importa automaticamente os 50.612 modelos e 751 exclusões se não houver histórico de importação nem metadados EDF existentes. A carga usa transação e o mesmo bloqueio da importação administrativa, não exige login, gera auditoria privada com autor System e não é repetida a cada reinício. Falhas de leitura ou validação impedem uma inicialização silenciosa com catálogo vazio. Não houve alteração de migrations já aplicadas.

O pacote contém apenas dados do catálogo, sem contas, equipamentos dos jogadores ou credenciais. A busca aplica filtros adicionais; os PNGs e o manifesto de ícones usam a mesma versão de origem. Alguns vínculos de ícones ainda precisam de confirmação visual no jogo.

Para instalações que já receberam importação administrativa ou possuem metadados EDF, a inicialização preserva os dados existentes, mesmo que sejam diferentes da versão embutida. Não tenta reparar automaticamente importações antigas ou catálogos esvaziados. A ferramenta manual `python -B preparacao/importar-catalogo.py` continua disponível para manutenção autenticada, com `EQUIPMENT_LOCAL_TOKEN` somente na memória do processo e URL fixa `http://127.0.0.1:18080/api/equipment/catalog/import`. Sem o snapshot EDF local, ela lê o mesmo recurso compactado do backend. Nenhuma carga foi executada no site oficial durante esta correção.

Bancos, uploads de teste, runtimes, cache Maven, evidências e o snapshot EDF completo não fazem parte deste PR.

## Validação

- Frontend: build, 142 testes e lint dos arquivos novos/alterados.
- Importador: self-check do pacote e das regras de duplicação/inatividade, mais 7 testes dos efeitos extras.
- Backend: Maven verify com 76 testes aprovados. Os testes de inicialização cobrem o pacote completo, auditoria System privada, reinicialização sem sobrescrita, preservação de importação prévia e de metadados sem histórico.
- Smoke test do JAR em banco novo: health UP, importação automática de 50.612 modelos, nove categorias com resultados Cora. Helmet Cora/Force/C nível 38 retornou 10 modelos; arma Cora/C nível 45 retornou 238. Os sete PNGs públicos de ícones do site oficial responderam HTTP 200. A consulta administrativa do catálogo oficial exige autenticação; seu banco não foi acessado nem alterado.

A branch original do laboratório e seu banco foram preservados. A integração usa a branch `codex/modulo-equipamentos`, baseada na `main` atualizada. Abrir este PR não integra nem publica a mudança.
