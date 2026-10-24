# Chamadas de PT no Discord — ambiente local

Página: http://127.0.0.1:15175/party, backend 18082.

O líder da PT ou um administrador inicia uma rodada no botão **Chamar PT no Discord**. As chamadas ocorrem no início, em 2min30s e em 5min. O bot adiciona ✅; a reação do próprio membro em qualquer mensagem da rodada elimina suas próximas menções. Remover a reação não desfaz a confirmação. Se todos confirmarem, a rodada encerra antes da terceira chamada. Uma nova rodada só pode começar após os cinco minutos e o encerramento da anterior.

Os destinatários são os integrantes vinculados ao Discord no início da rodada. Quem sair, trocar a conta vinculada, for suspenso ou tiver o cadastro desativado deixa de receber. Novos integrantes entram apenas na próxima rodada. O site informa integrantes ignorados. Somente menções individuais da lista são permitidas; nenhuma menção a cargos ou everyone.

## Configuração

Configure `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID` e `DISCORD_PARTY_CHANNEL_ID` no ambiente. O exemplo `discord-local.example.properties` permite configuração local em um arquivo `.private.properties`, ignorado pelo Git. Nunca copie o token para documentos, logs ou commits.

O bot precisa ver o canal, enviar mensagens, ler histórico e adicionar reações. O bot já usado pelo projeto requer os intents Server Members e Presence; o código também solicita Guild Message Reactions. Esta função não necessita Message Content. No Discord da Blacklist, o canal `chamadas-de-party` já foi criado em CHATS com permissões sincronizadas; reutilize-o.

Não ative simultaneamente estas chamadas em produção e em um ambiente local conectado à mesma comunidade. Desligue as chamadas locais antes de ativar produção. Veja [o guia de integração](QUESTS_PARTY_INTEGRACAO.md) para as migrations.

Um teste anterior confirmou envio real sem menções e adição de ✅. Ainda não foi executada uma rodada real de três mensagens para jogadores.

## Persistência e validação

A migração V70 guarda a rodada, mensagens e confirmações no PostgreSQL. Uma falha de envio incerta interrompe a rodada e exige conferir o canal; não há repetição automática que possa duplicar menções. Um backend desligado por mais de 30 segundos após o horário esperado encerra a rodada sem disparar lembretes atrasados. O botão distingue envios, confirmações e erros.

Testes automatizados usam um Discord simulado: horários, deduplicação, permissões, reações, saída da PT, reinício e falhas. O envio real e a sincronização de permissões devem ser verificados após configurar o bot, com uma PT de teste cujos integrantes concordem em receber as chamadas. Não publicar links localhost no Discord.
