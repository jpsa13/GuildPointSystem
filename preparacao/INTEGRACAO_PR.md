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

As migrations criam a estrutura; o catálogo precisa de **uma importação administrativa** antes de oferecer modelos. O pacote `catalogo-equipamentos.json.gz` contém 50.612 modelos e 751 exclusões da fonte já validada, sem contas, equipamentos de jogadores, tokens ou dados dos bancos locais. A busca aplica filtros adicionais, portanto não oferece todos os modelos importados. Os PNGs e o manifesto de ícones usam a mesma versão de origem. A associação visual de alguns ícones ainda precisa de confirmação no jogo.

Para importar, use `python -B preparacao/importar-catalogo.py` com `EQUIPMENT_LOCAL_TOKEN` contendo uma sessão administrativa válida, somente na memória do processo. O script mantém a URL fixa em `http://127.0.0.1:18080/api/equipment/catalog/import`. Para a instalação futura, execute-o junto ao backend nesse endereço ou por túnel loopback autenticado previamente conferido. Não foi feita importação no site publicado. Sem o snapshot EDF local, o script lê o pacote compactado deste PR; com o snapshot, regenera o payload pela mesma regra. A importação preserva os campos originais do catálogo compartilhado e os snapshots das entregas anteriores.

Bancos, uploads de teste, runtimes, cache Maven, evidências e o snapshot EDF completo não fazem parte deste PR.

## Validação

- Frontend: build, 142 testes e lint dos arquivos novos/alterados.
- Importador: self-check do pacote e das regras de duplicação/inatividade, mais 7 testes dos efeitos extras.
- Backend: Maven verify aprovado, 73 testes sem falhas/erros/ignorados, contra PostgreSQL novo e isolado, com toda a sequência da `main` e V57–V63.

A branch original do laboratório e seu banco foram preservados. A integração usa a branch `codex/modulo-equipamentos`, baseada na `main` atualizada. Abrir este PR não integra nem publica a mudança.
