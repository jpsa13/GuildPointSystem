# Atualização dos equipamentos por WebSocket

O layout autenticado mantém uma única assinatura de `/topic/equipment`, inclusive fora da tela de equipamentos. Foram removidos os intervalos HTTP do quadro, histórico e revisões.

As consultas HTTP continuam na carga inicial, após alterações e na conexão/reconexão do WebSocket. O evento comum atualiza quadro e revisões; para administradores também invalida histórico e logs privados. A importação publica `catalogChanged: true`, invalidando adicionalmente as buscas e o status do catálogo. Reconectar também recupera esses dados, cobrindo eventos perdidos durante a queda. As notificações são publicadas após o commit e contêm apenas indicadores de mudança.

O aviso de revisão recebe atualizações no layout geral. Um temporizador local muda revisões pendentes para vencidas no prazo recebido da API, sem polling; confirmação e novos pedidos continuam sincronizados pelo WebSocket. O servidor continua responsável pelas permissões e pelo estado persistido.

## Validação local em 23/10/2026

- Frontend: 155 testes aprovados, build e lint dos arquivos alterados.
- Backend: 80 testes aprovados e Maven verify concluído.
- Testes automatizados: 90 segundos sem novas consultas periódicas; primeira conexão e reconexão; invalidação específica do catálogo; limpeza de assinaturas em StrictMode; permissões; aviso recebido fora da tela; vencimento de 72h sem HTTP; confirmação e prazos sucessivos; publicação somente após commit sem dados privados no evento.
- Navegador em `127.0.0.1:15174`, backend isolado em `127.0.0.1:18081`: aviso recebido no dashboard e confirmado na tela de equipamentos. Janela estável de 59 segundos sem nenhum GET de equipamentos. Ao reiniciar somente o backend isolado, a página voltou de Conectando para Online e buscou quadro, revisões, histórico e catálogo automaticamente, sem recarregamento.

O pedido de revisão foi feito para um personagem fictício e confirmado pelo fluxo normal, preservando sua auditoria. Nenhum equipamento ou ponto foi alterado. O site oficial e o ambiente local anterior foram preservados. Eventos de outros módulos ainda podem fazer consultas periódicas; esse comportamento não foi alterado nesta tarefa.
