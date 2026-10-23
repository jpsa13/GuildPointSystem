package com.guild.app.presence;

import com.guild.app.member.entity.Member;
import com.guild.app.member.repository.MemberRepository;
import com.guild.app.presence.dto.AuctionViewer;
import com.guild.app.presence.dto.OnlineMember;
import com.guild.app.presence.dto.PresenceSnapshot;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Collectors;

/**
 * Who is connected right now, on which page and with what round-trip time. Kept in memory only: a
 * session lives as long as its socket ({@link PresenceEventListener}) and reports its page and ping
 * itself ({@link PresenceWsController}). Member names are loaded in bulk when a snapshot is built, so
 * socket events never wait on the database.
 */
@Component
public class PresenceRegistry {

    static final String OTHER = "other";
    /** Page keys the client may report; anything else is counted as "other" (bounded metric labels). */
    public static final Set<String> PAGES = Set.of(
            "dashboard", "donate", "logs", "objectives", "events", "party", "items",
            "auctions", "auction", "profile", "admin", "server-info", OTHER);
    static final Set<String> TRANSPORTS = Set.of("websocket", "sockjs");
    private static final int MAX_DETAIL = 40;
    private static final int MAX_RTT_MS = 60_000;

    private record MemberCard(String nickname, String className, String classImageUrl) {}

    private static final class Session {
        final long memberId;
        final Instant connectedAt = Instant.now();
        volatile String page = OTHER;
        volatile String detail;
        volatile String transport;
        volatile Integer rttMs;
        volatile boolean hidden;
        volatile Instant reportedAt;

        Session(long memberId) {
            this.memberId = memberId;
        }

        Instant lastActivity() {
            return reportedAt != null ? reportedAt : connectedAt;
        }
    }

    private final MemberRepository memberRepository;
    private final Timer clientRtt;
    private final Map<String, Session> sessions = new ConcurrentHashMap<>();
    private final Map<Long, MemberCard> cards = new ConcurrentHashMap<>();
    private final AtomicBoolean changed = new AtomicBoolean();

    public PresenceRegistry(MemberRepository memberRepository, MeterRegistry meterRegistry) {
        this.memberRepository = memberRepository;
        // Real ping as members feel it: browser → server → browser over the open STOMP socket.
        this.clientRtt = Timer.builder("guild.client.rtt").register(meterRegistry);
        Gauge.builder("guild.presence.members", this, r -> r.currentPages().size())
                .tag("page", "all")
                .register(meterRegistry);
        for (String page : PAGES) {
            Gauge.builder("guild.presence.members", this, r -> countOnPage(r.currentPages(), page))
                    .tag("page", page)
                    .register(meterRegistry);
        }
    }

    public void connected(String sessionId, long memberId) {
        sessions.put(sessionId, new Session(memberId));
        changed.set(true);
    }

    public void disconnected(String sessionId) {
        var removed = sessions.remove(sessionId);
        if (removed == null) return;
        changed.set(true);
        // Reload the name/class on the member's next visit (they may have changed it meanwhile).
        if (sessions.values().stream().noneMatch(s -> s.memberId == removed.memberId)) {
            cards.remove(removed.memberId);
        }
    }

    public void report(String sessionId, long memberId, String page, String detail, String transport,
                       Integer rttMs, boolean hidden) {
        var session = sessions.computeIfAbsent(sessionId, id -> new Session(memberId));
        if (session.memberId != memberId) return;

        session.page = page != null && PAGES.contains(page) ? page : OTHER;
        session.detail = detail == null || detail.isBlank() ? null : truncate(detail.strip());
        session.transport = transport != null && TRANSPORTS.contains(transport) ? transport : null;
        session.hidden = hidden;
        if (rttMs != null && rttMs >= 0 && rttMs <= MAX_RTT_MS) {
            session.rttMs = rttMs;
            clientRtt.record(Duration.ofMillis(rttMs));
        }
        session.reportedAt = Instant.now();
        changed.set(true);
    }

    /** True once per batch of changes (the broadcaster pushes at most one snapshot per tick). */
    public boolean takeChanged() {
        return changed.getAndSet(false);
    }

    /** One row per member; with several tabs open, the most recently active tab wins. */
    public PresenceSnapshot snapshot() {
        var byMember = sessions.values().stream().collect(Collectors.groupingBy(s -> s.memberId));
        loadMissingCards(byMember.keySet());

        var rows = byMember.entrySet().stream()
                .map(entry -> {
                    var tabs = entry.getValue();
                    var latest = tabs.stream().max(Comparator.comparing(Session::lastActivity)).orElseThrow();
                    var since = tabs.stream().map(s -> s.connectedAt).min(Comparator.naturalOrder()).orElseThrow();
                    var card = cards.getOrDefault(entry.getKey(), new MemberCard("#" + entry.getKey(), null, null));
                    return new OnlineMember(entry.getKey(), card.nickname(), card.className(), card.classImageUrl(),
                            latest.page, latest.detail, latest.transport, latest.rttMs, latest.hidden, since, tabs.size());
                })
                .sorted(Comparator.comparing(OnlineMember::nickname, String.CASE_INSENSITIVE_ORDER))
                .toList();
        return new PresenceSnapshot(rows, Instant.now());
    }

    /**
     * auctionId → members with that auction open (any of their tabs, not just the latest), for the
     * "who is here" list next to the auction chat. Auctions nobody is viewing are left out.
     */
    public Map<Long, List<AuctionViewer>> auctionViewers() {
        Map<Long, Map<Long, Boolean>> idleByAuction = new HashMap<>();
        for (Session s : sessions.values()) {
            Long auctionId = auctionIdOf(s);
            if (auctionId == null) continue;
            // A member is idle only if every tab they have on this auction is in the background.
            idleByAuction.computeIfAbsent(auctionId, id -> new HashMap<>())
                    .merge(s.memberId, s.hidden, (a, b) -> a && b);
        }
        idleByAuction.values().forEach(byMember -> loadMissingCards(byMember.keySet()));

        Map<Long, List<AuctionViewer>> result = new HashMap<>();
        idleByAuction.forEach((auctionId, byMember) -> result.put(auctionId, byMember.entrySet().stream()
                .map(e -> {
                    var card = cards.getOrDefault(e.getKey(), new MemberCard("#" + e.getKey(), null, null));
                    return new AuctionViewer(e.getKey(), card.nickname(), card.className(), card.classImageUrl(),
                            e.getValue());
                })
                .sorted(Comparator.comparing(AuctionViewer::nickname, String.CASE_INSENSITIVE_ORDER))
                .toList()));
        return result;
    }

    public List<AuctionViewer> auctionViewers(long auctionId) {
        return auctionViewers().getOrDefault(auctionId, List.of());
    }

    /** The client reports an auction page as page "auction" with detail "#<id>". */
    private static Long auctionIdOf(Session s) {
        String detail = s.detail;
        if (!"auction".equals(s.page) || detail == null || !detail.startsWith("#")) return null;
        try {
            return Long.parseLong(detail.substring(1));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private void loadMissingCards(Set<Long> memberIds) {
        var missing = memberIds.stream().filter(id -> !cards.containsKey(id)).toList();
        if (missing.isEmpty()) return;
        for (Member m : memberRepository.findAllByIdInWithClass(missing)) {
            var cls = m.getCharacterClass();
            cards.put(m.getId(), new MemberCard(m.getNickname(),
                    cls != null ? cls.getName() : null, cls != null ? cls.getImageUrl() : null));
        }
    }

    /** memberId → page of their most recently active tab. */
    private Map<Long, String> currentPages() {
        return sessions.values().stream().collect(Collectors.toMap(
                s -> s.memberId, s -> s, (a, b) -> a.lastActivity().isAfter(b.lastActivity()) ? a : b))
                .entrySet().stream()
                .collect(Collectors.toMap(Map.Entry::getKey, e -> e.getValue().page));
    }

    private static long countOnPage(Map<Long, String> pages, String page) {
        return pages.values().stream().filter(page::equals).count();
    }

    private static String truncate(String value) {
        return value.length() <= MAX_DETAIL ? value : value.substring(0, MAX_DETAIL);
    }
}
