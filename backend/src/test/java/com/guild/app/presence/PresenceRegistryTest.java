package com.guild.app.presence;

import com.guild.app.member.entity.CharacterClass;
import com.guild.app.member.entity.Member;
import com.guild.app.member.repository.MemberRepository;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

import java.util.Collection;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class PresenceRegistryTest {

    private final MemberRepository memberRepository = mock(MemberRepository.class);
    private final SimpleMeterRegistry meters = new SimpleMeterRegistry();
    private final PresenceRegistry registry = new PresenceRegistry(memberRepository, meters);

    PresenceRegistryTest() {
        when(memberRepository.findAllByIdInWithClass(anyCollection())).thenAnswer(inv -> {
            Collection<Long> ids = inv.getArgument(0);
            return ids.stream().map(PresenceRegistryTest::member).toList();
        });
    }

    private static Member member(long id) {
        var cls = new CharacterClass();
        cls.setName("Warrior");
        var m = new Member();
        m.setId(id);
        m.setNickname("Membro" + id);
        m.setCharacterClass(cls);
        return m;
    }

    private double onPage(String page) {
        return meters.get("guild.presence.members").tag("page", page).gauge().value();
    }

    @Test
    void severalTabsShowAsOneMemberOnTheMostRecentPage() throws InterruptedException {
        registry.connected("s1", 7);
        registry.connected("s2", 7);
        registry.report("s1", 7, "party", null, "websocket", 40, false);
        Thread.sleep(5);
        registry.report("s2", 7, "auction", "#12", "websocket", 55, true);

        var rows = registry.snapshot().members();
        assertThat(rows).hasSize(1);
        var row = rows.getFirst();
        assertThat(row.nickname()).isEqualTo("Membro7");
        assertThat(row.className()).isEqualTo("Warrior");
        assertThat(row.page()).isEqualTo("auction");
        assertThat(row.detail()).isEqualTo("#12");
        assertThat(row.rttMs()).isEqualTo(55);
        assertThat(row.hidden()).isTrue();
        assertThat(row.tabs()).isEqualTo(2);
        assertThat(onPage("auction")).isEqualTo(1);
        assertThat(onPage("party")).isZero();
        assertThat(onPage("all")).isEqualTo(1);
    }

    @Test
    void sanitizesWhatTheClientSends() {
        registry.connected("s1", 1);
        registry.report("s1", 1, "<script>", "x".repeat(200), "carrier-pigeon", 999_999, false);

        var row = registry.snapshot().members().getFirst();
        assertThat(row.page()).isEqualTo(PresenceRegistry.OTHER);
        assertThat(row.detail()).hasSize(40);
        assertThat(row.transport()).isNull();
        assertThat(row.rttMs()).isNull();
    }

    @Test
    void reportFromAnotherMembersSessionIsIgnored() {
        registry.connected("s1", 1);
        registry.report("s1", 2, "party", null, "websocket", 10, false);
        assertThat(registry.snapshot().members().getFirst().page()).isEqualTo(PresenceRegistry.OTHER);
    }

    @Test
    void memberGoesOfflineWhenTheLastSocketCloses() {
        registry.connected("s1", 3);
        registry.connected("s2", 3);
        registry.disconnected("s1");
        assertThat(registry.snapshot().members()).hasSize(1);
        registry.disconnected("s2");
        assertThat(registry.snapshot().members()).isEmpty();
        assertThat(onPage("all")).isZero();
    }

    @Test
    void changesAreReportedOncePerBatch() {
        assertThat(registry.takeChanged()).isFalse();
        registry.connected("s1", 1);
        registry.report("s1", 1, "logs", null, "sockjs", 20, false);
        assertThat(registry.takeChanged()).isTrue();
        assertThat(registry.takeChanged()).isFalse();
    }

    @Test
    void recordsEveryValidPingInTheRttTimer() {
        registry.connected("s1", 1);
        registry.report("s1", 1, "logs", null, "websocket", 30, false);
        registry.report("s1", 1, "logs", null, "websocket", 70, false);
        registry.report("s1", 1, "logs", null, "websocket", null, false);
        assertThat(meters.get("guild.client.rtt").timer().count()).isEqualTo(2);
        assertThat(List.of(registry.snapshot().members().getFirst().rttMs())).containsExactly(70);
    }
}
