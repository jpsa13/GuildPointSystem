# Gear score e consulta pública de equipamentos

O botão **Ver jogadores** abre a lista para membros aprovados com perfil completo. Somente o próprio personagem pode ser editado por um membro comum. Administradores/Líder conservam a gestão de todos; históricos, entregas e auditoria seguem privados. A lista oferece nome A–Z/Z–A, GS crescente/decrescente e nível crescente/decrescente.

O backend calcula o GS na leitura, sem atualizar equipamentos ou pontos, sem migrations e sem ligação com lances. Todos os itens são tratados como +0. O total soma a maior das duas armas, as cinco peças de armadura e os quatro acessórios; capa não participa.

## Regra de armas e armaduras

Base decimal por nível original: até 39 = 31; 40 = 31,48; 41 = 31,97; 43 = 34,84; 45 = 38,87; 47 = 44,50; 50 = 50,71; 53 = 57; 55 = 63; 57 = 69; 60 = 78; 63 = 88,20; 65 = 95. Níveis intermediários usam interpolação linear. Fora de 1–65 a pontuação fica pendente.

Multiplicadores de grade: 0 = 0,95; 1/B = 1; 2 = 1,03; 3/C = 1,08; 10 = 1,15. Arredondar a base multiplicada para duas casas, multiplicar por dez e truncar; depois aplicar o peso de categoria: arma ×5, armadura ×1.

Em Type C, o código de modelo só é interpretado após conferir categoria, código, nome, nível, grade e hash no catálogo EDF distribuído com a aplicação. O nível original vem do código de modelo validado e não pode ser inferior ao exigido. Modelos/versões não confirmados ficam pendentes, em vez de receber um nível presumido.

Exemplos: C 43→38 = 376 por armadura; C 45→40 = 419; C 47→42 = 480; C 50→45 = 547. Uma arma C 50→45 = 2.735, igual a cinco armaduras C de nível original 50.

## Acessórios

Usar todos os efeitos do item no catálogo confirmado, não somente a opção escolhida na interface. Pontos por unidade: ataque/defesa 10 por ponto percentual; esquiva 10 por ponto; SP/FP máximo e redução de consumo FP 3 por ponto percentual; HP máximo 5 por ponto percentual; nível de skill 150 por nível. O efeito combinado Max HP/FP soma HP e FP (8 por ponto percentual). Consumo de FP negativo no EDF representa redução e é convertido em benefício positivo.

Somar 100 pontos-base + maior contribuição integral + metade das demais contribuições; multiplicar o resultado por 3 e arredondar ao inteiro mais próximo. Efeitos sem classificação, ausentes ou negativos sem regra confirmada deixam o item pendente. Não ignorar silenciosamente bônus desconhecidos.

Exemplos: ataque 25% = 1.050 por acessório; ataque 25% + defesa 20% = 1.350; skill +1 = 750; consumo FP −10% = 390. Um par de mistos soma 2.700, próximo da arma/set C 50 de 2.735. Um par puro de ataque 25% soma 2.100, próximo do set C 45 de 2.095. São pesos de comparação geral, não uma medida de dano real ou adequação à classe.

Se houver item equipado sem pontuação confirmada, mostrar **GS parcial** e a quantidade pendente. Itens vazios somam zero. Uma reserva não classificada também sinaliza parcial, pois poderia superar a arma conhecida. Fonte do cálculo compartilhada no backend; a lista pública recebe os mesmos totais dos administradores, sem campos de auditoria.

## Validação local — 25/10/2026

167 testes frontend e 111 backend aprovados; build e lint dos arquivos frontend alterados. A suíte inclui os quatro rebaixamentos de armadura, os pesos, bônus mistos, redução de FP com sinal negativo no EDF, reserva, classificação pendente, cálculo igual na resposta pública e privacidade da auditoria. O teste de interface verifica consulta pública, ordenação por GS e ausência de edição de outro membro.

Prévia separada em `http://127.0.0.1:15176/equipment`, backend `127.0.0.1:18083` e bancos novos `guild_gearscore_test_20261025` / `guild_gearscore_preview_20261025` no PostgreSQL de testes em 15433. A simulação registrou equipamentos somente para personagens fictícios; resultado confirmado pela API: membro 7.530 GS (arma 2.735, armaduras 2.095, acessórios 2.700), líder 5.470 e administrador 2.100. Membro comum recebeu 403 ao tentar remover equipamento de outro ou ler históricos, e a lista pública não continha campos de auditoria. Navegador confirmou a ordenação e inspeção somente de leitura. Sem alteração no site publicado, nos registros dos ambientes anteriores ou nas mudanças paralelas de quests/Discord.
