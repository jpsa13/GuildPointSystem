package com.guild.app.characterstatus.dto;

import java.time.Instant;

/**
 * Situacao da sincronizacao DLL do membro logado.
 *
 * @param synced         enviou dados do jogo dentro da janela (ex.: ultimos 3 dias)
 * @param lastSyncAt     ultimo envio de qualquer personagem (null = nunca)
 * @param deadline       a partir de quando o acesso exige estar sincronizado
 * @param newAccount     prazo vem do cadastro (contas criadas depois do prazo geral)
 * @param blocked        prazo passou e nao esta sincronizado: o site recusa as requisicoes
 * @param windowDays     tamanho da janela de "recente"
 */
public record SyncAccessView(
        boolean synced,
        Instant lastSyncAt,
        Instant deadline,
        boolean newAccount,
        boolean blocked,
        long windowDays
) {}
