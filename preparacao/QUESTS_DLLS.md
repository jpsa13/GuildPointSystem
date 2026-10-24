# DLLs e integração de quests

O acompanhamento de quests usa um monitor Python externo e somente leitura. Não houve alteração ou instalação de DLL para o pareamento, journal, nível, XP ou checklist.

O pacote portátil já publicado em `app/rf-ui-portatil` e `downloads/RF-ui-Stage-Era-portatil.zip` permanece válido e separado do monitor:

| Arquivo | Versão | SHA-256 |
| --- | --- | --- |
| dinput8.dll | rf-ui 0.4.4 | 28122308cdca160ec60399bff096529d85c1e5977788c7955241617bbcb450d6 |
| version.dll | CerberusBags 0.1.4 | 3ba7180bb3c850afba2ad52f27ff26da1e6695ca1e156552e243a282ccb378b4 |

Os dois binários, seus INIs limpos e o ZIP foram comparados ao manifesto: os quatro hashes coincidem. Os binários são incorporados do repositório RF-ui neste PR, sem recompilação.

A revisão de bags 0.1.5 encontrada na instalação de desenvolvimento e a candidata 0.1.7 em outro diretório são trabalhos de UI/bags, com hashes distintos. Não pertencem ao monitor de quests e não foram misturadas ao pacote 0.1.4. O PR inclui os fontes do monitor, o launcher seguro e os testes; a execução requer Python 3 e o cliente compatível já instalado. Não distribui executáveis do jogo, EDFs, capturas de memória, filas, tokens ou telemetria pessoal.

No PR original do RF-ui, o ZIP foi republicado somente com o guia de integração atualizado; os quatro arquivos de payload continuam byte a byte iguais ao manifesto. Validação histórica do snapshot RF-ui: 97 testes Java, 162 frontend, 11 Python; build e lint dos arquivos alterados passaram.
