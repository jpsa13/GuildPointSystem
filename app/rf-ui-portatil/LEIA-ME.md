# rf-ui 0.4.4 + CerberusBags 0.1.4 — portátil

Pacote para o cliente **RF Cerberus — Stage Era, versão 4 GB**. Contém os mesmos dois módulos cujos hashes foram conferidos na instalação local. Não é um jogo completo nem um aplicativo independente: instale o cliente do servidor no outro PC primeiro.

## Instalar no outro PC

1. Baixe o ZIP, clique em **Propriedades → Desbloquear**, se o Windows oferecer essa opção, e extraia toda a pasta para um diretório seu, **fora da pasta do jogo**. Não execute de dentro do ZIP.
2. Feche o jogo e o launcher. Abra o **Windows PowerShell** na pasta extraída.
3. Informe o caminho real do cliente nesse PC; não precisa ser a unidade F:

```powershell
.\Instalar.ps1 -ClientPath 'D:\Jogos\RF Cerberus - Stage Era'
```

Para conferir compatibilidade sem instalar:

```powershell
.\Instalar.ps1 -ClientPath 'D:\Jogos\RF Cerberus - Stage Era' -ValidateOnly
```

4. Ative **RFOnline 4gb** nas opções do launcher e inicie o jogo normalmente. O instalador não inicia nem injeta nada em um processo aberto.
5. Após entrar no mundo, use o botão do rf-ui no canto inferior direito. O botão **Bags**, no canto superior direito, configura o agrupamento de 2–5 bolsas. O padrão é 3 agrupadas + 2 separadas; solte itens em arraste e feche as bolsas agrupadas para aplicar mudanças. Deixe o modo nativo de bolsa única desligado.

Use inicialmente modo janela. O instalador recusa um executável diferente ou proxies conflitantes antes de copiar arquivos. Não tente desativar a verificação de hash para contornar uma atualização de cliente.

Se uma política do Windows impedir a execução de scripts, não é necessário alterá-la. Faça a instalação manual com jogo/launcher fechados: confira o hash do `RF_Online_4gb.bin` com `Get-FileHash`, compare com o hash abaixo e faça backup das DLLs/INIs existentes fora do cliente. Se já houver `dinput8.dll` ou `version.dll` de outro mod, resolva o conflito antes. Copie as duas DLLs de `payload` para a raiz do cliente; copie os INIs somente se não existirem. Depois ative 4 GB no launcher. O instalador é recomendado por conferir também os hashes e os conflitos automaticamente.

## Arquivos necessários

| Arquivo | Função |
|---|---|
| `payload/dinput8.dll` | rf-ui original 0.4.4, de r3ngr4y |
| `payload/version.dll` | complemento CerberusBags 0.1.4 |
| `payload/rf-ui.ini` | configuração inicial limpa, sem atalhos/itens de personagens |
| `payload/CerberusBags.ini` | padrão de agrupamento 3+2 |
| `manifest.json` | hashes dos quatro arquivos, conferidos pelo instalador |
| `licencas/` | licenças e avisos de terceiros |

Os imports PE das duas DLLs foram inspecionados: suas dependências importadas são componentes do Windows (`bcrypt`, `d3d9`, `dwmapi`, `gdi32`, `kernel32`, `msvcrt`, `user32`, `winmm`). Nenhuma DLL adicional de runtime GCC/C++ é exigida pela tabela de imports. Não copie DLLs de System32/SysWOW64 de outro PC. O cliente completo continua responsável por suas próprias dependências e arquivos de jogo; eles não acompanham este pacote.

## Configurações, backup e remoção

INIs existentes são preservados. Antes da instalação, arquivos já existentes são copiados e conferidos em `backups/` ao lado deste instalador. Em falha de cópia, ele tenta restaurar os arquivos modificados. Uma DLL diferente no destino é um conflito: o instalador não remove ou substitui automaticamente outro mod.

Para levar seu layout pessoal, com jogo e launcher fechados nos dois PCs, copie você mesmo o seu `rf-ui.ini` e, se desejar, `CerberusBags.ini`, fazendo antes backup dos INIs do destino. O pacote publicado usa configurações limpas e não inclui inventário, logs ou atalhos pessoais. Atalhos podem precisar de ajuste em outro personagem.

Para remover, feche jogo/launcher, retire **somente** `dinput8.dll` e `version.dll` instaladas por este pacote e recoloque as cópias anteriores de `backups/`, se houver. Você pode manter os INIs para uma instalação futura. Não apague outras DLLs do cliente. Não misture com a `version.dll` da antiga CerberusUI.

## Compatibilidade e validação

Executável aceito (`RF_Online_4gb.bin`, SHA-256):

```text
8343dc2afba9537f5c41c713b3af5516d0be75f6ad9a9bdb6ed9722238645379
```

rf-ui original: [release v0.4.4](https://github.com/r3ngr4y/rf-ui-releases/releases/tag/v0.4.4). Sua licença **PolyForm Noncommercial 1.0.0** e o aviso do autor estão em `licencas/rf-ui-LICENSE.txt`; avisos de bibliotecas em `rf-ui-LICENSES.txt`. O arquivo original não foi modificado. CerberusBags é um complemento separado, com sua própria proveniência e avisos do runtime. Este pacote não atribui autoria ou uma nova licença ao rf-ui e destina-se a uso pessoal não comercial conforme os termos incluídos.

O pacote não contém o protótipo antigo CerberusUI, DLLs Bagnon fechadas, cliente RF, monitor de quests, credenciais ou banco do site. A UI do jogo funciona independentemente do GuildPointSystem; o monitor externo de quests agora funciona separadamente pelo repositório, com pareamento ao site local. Consulte [o guia de quests](../../GuildPointSystem/preparacao/QUESTS_LIVE.md). Ele requer Python 3 e não exige atualizar estas DLLs.

Hashes, imports, conteúdo do ZIP e instalação em pasta de teste foram verificados sem executar o jogo. O funcionamento em **outro PC** ainda precisa ser confirmado; atualização de cliente, troca de personagem/mapa/resolução e outros mods podem causar incompatibilidade ou crash. Não há garantia de invisibilidade para anticheat.
