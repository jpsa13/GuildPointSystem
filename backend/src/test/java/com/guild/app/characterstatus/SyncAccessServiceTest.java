package com.guild.app.characterstatus;

import com.guild.app.characterstatus.repository.CharacterStatusRepository;
import com.guild.app.characterstatus.service.SyncAccessService;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SyncAccessServiceTest {

    private final CharacterStatusRepository repository = mock(CharacterStatusRepository.class);
    private final Instant now = Instant.now();

    private SyncAccessService service(Instant enforceFrom) {
        return new SyncAccessService(repository, enforceFrom.toString().replace("Z", "+00:00"),
                Duration.ofDays(3), Duration.ofDays(1));
    }

    @Test
    void beforeDeadlineNobodyIsBlocked() {
        when(repository.findLastSyncAt(1L)).thenReturn(Optional.empty());
        var service = service(now.plus(Duration.ofDays(2)));

        assertThat(service.isBlocked(1L, now.minus(Duration.ofDays(30)))).isFalse();
        var status = service.status(1L, now.minus(Duration.ofDays(30)));
        assertThat(status.synced()).isFalse();
        assertThat(status.blocked()).isFalse();
        assertThat(status.newAccount()).isFalse();
    }

    @Test
    void afterDeadlineOnlyRecentSyncPasses() {
        var service = service(now.minus(Duration.ofHours(1)));
        Instant oldAccount = now.minus(Duration.ofDays(30));

        when(repository.findLastSyncAt(1L)).thenReturn(Optional.of(now.minus(Duration.ofDays(2))));
        when(repository.findLastSyncAt(2L)).thenReturn(Optional.of(now.minus(Duration.ofDays(4))));
        when(repository.findLastSyncAt(3L)).thenReturn(Optional.empty());

        assertThat(service.isBlocked(1L, oldAccount)).isFalse();
        assertThat(service.isBlocked(2L, oldAccount)).isTrue();
        assertThat(service.isBlocked(3L, oldAccount)).isTrue();
    }

    @Test
    void newAccountGetsOneDayFromSignupAfterDeadline() {
        when(repository.findLastSyncAt(1L)).thenReturn(Optional.empty());
        var service = service(now.minus(Duration.ofDays(5)));

        Instant createdAt = now.minus(Duration.ofHours(10));
        var status = service.status(1L, createdAt);
        assertThat(status.newAccount()).isTrue();
        assertThat(status.deadline()).isEqualTo(createdAt.plus(Duration.ofDays(1)));
        assertThat(status.blocked()).isFalse();
        assertThat(service.isBlocked(1L, createdAt)).isFalse();

        assertThat(service.isBlocked(1L, now.minus(Duration.ofHours(25)))).isTrue();
    }

    @Test
    void ingestUnblocksImmediately() {
        when(repository.findLastSyncAt(1L)).thenReturn(Optional.empty());
        var service = service(now.minus(Duration.ofDays(1)));
        Instant oldAccount = now.minus(Duration.ofDays(30));

        assertThat(service.isBlocked(1L, oldAccount)).isTrue();
        service.recordSync(1L, Instant.now());
        assertThat(service.isBlocked(1L, oldAccount)).isFalse();
    }
}
