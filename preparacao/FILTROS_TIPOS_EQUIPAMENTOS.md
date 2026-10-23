# Filtros por efeito e tipo de equipamento

- Anéis e amuletos com `Christmas`/`Christmass` no nome ou terminados em `H` seguido de números ficam indisponíveis na busca e para novos cadastros por ID, em todas as raças e nas quatro posições. Equipamentos e registros anteriores são preservados.
- Acessórios oferecem Todos, Ataque (efeito 6), Esquiva (efeito 4) e Defesa (efeito 7). Cada filtro procura um bônus positivo, permitindo que um modelo misto pertença a mais de um grupo. A raça selecionada continua sendo aplicada; o seletor de acessórios foi liberado para Bellato, Cora e Accretia.
- Armas novas precisam conter `Intense` no nome, mantendo grades B/C e os níveis/variantes anteriormente aceitos.
- Tipos de arma usam o campo Type do EDF: faca, espada, machado, maça, lança, arco, arma de fogo, lançador, faca de arremesso, cajado, ferramenta de mineração e lança-granadas. A API retorna apenas tipos disponíveis para raça, classe, nível e grade; a escolha do tipo também restringe a busca textual e as habilidades.
- Melee usa tipos 0–4; Ranger 5, 6 e 8; Force 9; Launcher 7 e 11. Todos retira a seleção de tipo, preservando classe e demais filtros. Todas as classes retira a restrição de classe. Trocar classe ou raça limpa o tipo e a habilidade anteriores.
- A classe de armas é selecionada pelo cadastro do personagem, tanto para ele quanto para o administrador. Gunner, Striker e Dementer usam Launcher; classes desconhecidas permanecem em Todas as classes.

V65 adiciona somente `edf_weapon_type` e preenche 8.256 códigos da versão EDF já distribuída, usando categoria, código explícito e hash de origem. A importação também grava esse campo para cargas novas. V64 da principal e todas as migrations anteriores foram preservadas; não é preciso reimportar o catálogo existente nem alterar os equipamentos dos players.

Validação: suíte Java com 79 testes e frontend com 148 testes; build e lint. Casos incluem acessórios mistos, exclusões nas quatro posições/três raças, cadastro por ID, todos os tipos e classes, parâmetros inválidos e preservação de históricos. Nenhuma alteração foi aplicada no site oficial.
