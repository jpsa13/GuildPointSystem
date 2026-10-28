package com.guild.app.characterstatus.service;

import com.guild.app.characterstatus.dto.SyncAccessView;
import com.guild.app.characterstatus.repository.CharacterStatusRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Exige que o membro use a DLL de sincronizacao: depois do prazo, so acessa o site quem enviou
 * dados do jogo dentro da janela. Contas criadas depois do prazo geral ganham um prazo proprio
 * contado do cadastro.
 *
 * Nao prova que a DLL esta instalada (a ingestao nao e autenticada), apenas incentiva o uso.
 */
@Service
public class SyncAccessService {

    /** O filtro consulta a cada requisicao: evita um SELECT por chamada. */
    private static final Duration CACHE_TTL = Duration.ofSeconds(30);

    private record Entry(Optional<Instant> lastSyncAt, long expiresAt) {}

    private final CharacterStatusRepository statusRepository;
    private final Instant enforceFrom;
    private final Duration window;
    private final Duration newAccountGrace;
    private final Map<Long, Entry> cache = new ConcurrentHashMap<>();

    public SyncAccessService(
            CharacterStatusRepository statusRepository,
            @Value("${guild.sync.enforce-from}") String enforceFrom,
            @Value("${guild.sync.window:3d}") Duration window,
            @Value("${guild.sync.new-account-grace:1d}") Duration newAccountGrace) {
        this.statusRepository = statusRepository;
        this.enforceFrom = OffsetDateTime.parse(enforceFrom).toInstant();
        this.window = window;
        this.newAccountGrace = newAccountGrace;
    }

    public SyncAccessView status(Long memberId, Instant createdAt) {
        Instant now = Instant.now();
        Instant lastSyncAt = lastSyncAt(memberId).orElse(null);
        boolean synced = lastSyncAt != null && lastSyncAt.isAfter(now.minus(window));
        Instant deadline = deadline(createdAt);
        return new SyncAccessView(
                synced,
                lastSyncAt,
                deadline,
                deadline.isAfter(enforceFrom),
                !synced && !now.isBefore(deadline),
                window.toDays());
    }

    /** Usado pelo filtro: antes do prazo responde sem tocar no banco. */
    public boolean isBlocked(Long memberId, Instant createdAt) {
        Instant now = Instant.now();
        if (now.isBefore(deadline(createdAt))) return false;
        return lastSyncAt(memberId).map(at -> !at.isAfter(now.minus(window))).orElse(true);
    }

    /** Chamado na ingestao: libera o acesso na hora, sem esperar o cache expirar. */
    public void recordSync(Long memberId, Instant at) {
        cache.put(memberId, new Entry(Optional.of(at), System.currentTimeMillis() + CACHE_TTL.toMillis()));
    }

    private Instant deadline(Instant createdAt) {
        if (createdAt == null) return enforceFrom;
        Instant ownDeadline = createdAt.plus(newAccountGrace);
        return ownDeadline.isAfter(enforceFrom) ? ownDeadline : enforceFrom;
    }

    private Optional<Instant> lastSyncAt(Long memberId) {
        long nowMs = System.currentTimeMillis();
        Entry cached = cache.get(memberId);
        if (cached != null && cached.expiresAt() > nowMs) return cached.lastSyncAt();
        Optional<Instant> loaded = statusRepository.findLastSyncAt(memberId);
        cache.put(memberId, new Entry(loaded, nowMs + CACHE_TTL.toMillis()));
        return loaded;
    }
}
