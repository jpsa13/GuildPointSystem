package com.guild.app.auth.security;

import com.guild.app.common.enums.MemberStatus;
import com.guild.app.common.enums.Role;
import com.guild.app.member.entity.Member;
import org.junit.jupiter.api.Test;

import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MemberPrincipalCacheTest {

    private final MemberPrincipalCache cache = new MemberPrincipalCache();

    private static MemberPrincipal principal(long id, Role role) {
        var member = new Member();
        member.setId(id);
        member.setEmail("m" + id + "@test");
        member.setRole(role);
        member.setStatus(MemberStatus.APROVADO);
        return new MemberPrincipal(member);
    }

    @Test
    void servesRepeatedLookupsWithoutReloading() {
        var loads = new AtomicInteger();
        for (int i = 0; i < 5; i++) {
            cache.get(1L, () -> {
                loads.incrementAndGet();
                return principal(1, Role.MEMBRO);
            });
        }
        assertThat(loads).hasValue(1);
    }

    @Test
    void evictionMakesTheNextLookupReload() {
        cache.get(1L, () -> principal(1, Role.MEMBRO));
        cache.evict(1L);
        var reloaded = cache.get(1L, () -> principal(1, Role.ADMINISTRADOR));
        assertThat(reloaded.getRole()).isEqualTo(Role.ADMINISTRADOR);
    }

    @Test
    void loadRacingAnEvictionIsNotCached() {
        // The load read the row, then the change committed and evicted before the load stored it.
        cache.get(1L, () -> {
            cache.evict(1L);
            return principal(1, Role.MEMBRO);
        });
        var next = cache.get(1L, () -> principal(1, Role.ADMINISTRADOR));
        assertThat(next.getRole()).isEqualTo(Role.ADMINISTRADOR);
    }

    @Test
    void failedLookupsAreNotCached() {
        assertThatThrownBy(() -> cache.get(9L, () -> {
            throw new IllegalStateException("deleted");
        })).isInstanceOf(IllegalStateException.class);
        assertThat(cache.get(9L, () -> principal(9, Role.MEMBRO)).getId()).isEqualTo(9L);
    }
}
