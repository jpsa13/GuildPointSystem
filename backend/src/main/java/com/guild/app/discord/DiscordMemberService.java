package com.guild.app.discord;

import com.guild.app.discord.dto.DiscordMemberEntry;
import com.guild.app.discord.dto.DiscordMembersResponse;
import com.guild.app.discord.dto.DiscordRoleGroup;
import com.guild.app.member.entity.Member;
import com.guild.app.member.repository.MemberRepository;
import com.guild.app.websocket.WebSocketPublisher;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.dv8tion.jda.api.JDA;
import net.dv8tion.jda.api.JDABuilder;
import net.dv8tion.jda.api.OnlineStatus;
import net.dv8tion.jda.api.entities.Activity;
import net.dv8tion.jda.api.entities.Guild;
import net.dv8tion.jda.api.entities.GuildVoiceState;
import net.dv8tion.jda.api.entities.Role;
import net.dv8tion.jda.api.requests.GatewayIntent;
import net.dv8tion.jda.api.utils.ChunkingFilter;
import net.dv8tion.jda.api.utils.MemberCachePolicy;
import net.dv8tion.jda.api.utils.cache.CacheFlag;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Collectors;

/**
 * Mirrors the Discord server's member sidebar (only the configured roles) through a read-only bot.
 * Gateway events only mark the list dirty; a short scheduled tick rebuilds it and broadcasts when
 * it actually changed, so a burst of presence updates becomes a single WebSocket push.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DiscordMemberService {

    private static final int AVATAR_SIZE = 64;

    private final DiscordBotProperties properties;
    private final MemberRepository memberRepository;
    private final WebSocketPublisher webSocketPublisher;

    private final AtomicBoolean dirty = new AtomicBoolean(false);
    private volatile JDA jda;
    private volatile DiscordMembersResponse snapshot = DiscordMembersResponse.unavailable();

    @EventListener(ApplicationReadyEvent.class)
    public void start() {
        if (!properties.isEnabled()) {
            log.info("Discord bot disabled (DISCORD_BOT_TOKEN not set) — member list unavailable");
            return;
        }
        try {
            jda = JDABuilder.createLight(
                            properties.getToken(),
                            GatewayIntent.GUILD_MEMBERS,
                            GatewayIntent.GUILD_PRESENCES,
                            GatewayIntent.GUILD_VOICE_STATES)
                    .enableCache(CacheFlag.ONLINE_STATUS, CacheFlag.ACTIVITY, CacheFlag.VOICE_STATE)
                    .setMemberCachePolicy(MemberCachePolicy.ALL)
                    .setChunkingFilter(ChunkingFilter.ALL)
                    // Any gateway event can change what the list shows (presence, roles, nick, voice).
                    .addEventListeners((net.dv8tion.jda.api.hooks.EventListener) event -> dirty.set(true))
                    .build();
        } catch (Exception e) {
            log.error("Discord bot failed to start: {}", e.getMessage());
        }
    }

    @PreDestroy
    public void stop() {
        if (jda != null) {
            jda.shutdown();
        }
    }

    public DiscordMembersResponse snapshot() {
        return snapshot;
    }

    @Scheduled(fixedDelay = 2000)
    public void refreshIfDirty() {
        if (jda == null || !dirty.getAndSet(false)) {
            return;
        }
        try {
            DiscordMembersResponse next = build();
            if (!next.equals(snapshot)) {
                snapshot = next;
                webSocketPublisher.publishDiscordMembers(next);
            }
        } catch (Exception e) {
            log.warn("Discord member list refresh failed: {}", e.getMessage());
        }
    }

    private DiscordMembersResponse build() {
        Guild guild = resolveGuild();
        if (guild == null) {
            return DiscordMembersResponse.unavailable();
        }

        List<Role> roles = properties.getRoles().stream()
                .map(name -> guild.getRolesByName(name.trim(), true))
                .filter(found -> !found.isEmpty())
                .map(found -> found.get(0))
                .toList();

        // Each member goes under the first configured role they have, like Discord's hoisted roles.
        Map<Role, List<net.dv8tion.jda.api.entities.Member>> byRole = new LinkedHashMap<>();
        roles.forEach(role -> byRole.put(role, new ArrayList<>()));
        Set<String> discordIds = new HashSet<>();
        for (net.dv8tion.jda.api.entities.Member member : guild.getMemberCache()) {
            if (member.getUser().isBot()) continue;
            roles.stream()
                    .filter(member.getRoles()::contains)
                    .findFirst()
                    .ifPresent(role -> {
                        byRole.get(role).add(member);
                        discordIds.add(member.getId());
                    });
        }

        Map<String, Long> siteMemberIds = discordIds.isEmpty()
                ? Map.of()
                : memberRepository.findByDiscordIdIn(discordIds).stream()
                        .filter(m -> m.getDeletedAt() == null)
                        .collect(Collectors.toMap(Member::getDiscordId, Member::getId, (a, b) -> a));

        List<DiscordRoleGroup> groups = byRole.entrySet().stream()
                .map(entry -> toGroup(entry.getKey(), entry.getValue(), siteMemberIds))
                .toList();
        return new DiscordMembersResponse(true, guild.getName(), groups);
    }

    private Guild resolveGuild() {
        String guildId = properties.getGuildId();
        if (guildId != null && !guildId.isBlank()) {
            return jda.getGuildById(guildId.trim());
        }
        return jda.getGuilds().stream().findFirst().orElse(null);
    }

    private DiscordRoleGroup toGroup(
            Role role, List<net.dv8tion.jda.api.entities.Member> members, Map<String, Long> siteMemberIds) {
        List<DiscordMemberEntry> entries = members.stream()
                .map(m -> toEntry(m, siteMemberIds.get(m.getId())))
                // Online first (as Discord does), then alphabetical.
                .sorted(Comparator.comparing((DiscordMemberEntry e) -> e.status().equals("offline"))
                        .thenComparing(e -> e.name().toLowerCase()))
                .toList();
        int online = (int) entries.stream().filter(e -> !e.status().equals("offline")).count();
        return new DiscordRoleGroup(role.getId(), role.getName(), hexColor(role.getColorRaw()), online, entries);
    }

    private DiscordMemberEntry toEntry(net.dv8tion.jda.api.entities.Member member, Long siteMemberId) {
        String customStatus = null;
        String activity = null;
        for (Activity a : member.getActivities()) {
            if (a.getType() == Activity.ActivityType.CUSTOM_STATUS) {
                customStatus = a.getName();
            } else if (activity == null) {
                activity = describe(a);
            }
        }
        GuildVoiceState voice = member.getVoiceState();
        return new DiscordMemberEntry(
                member.getId(),
                member.getEffectiveName(),
                member.getEffectiveAvatar().getUrl(AVATAR_SIZE),
                hexColor(member.getColorRaw()),
                status(member.getOnlineStatus()),
                blankToNull(customStatus),
                activity,
                voice != null && voice.inAudioChannel(),
                siteMemberId);
    }

    private static String describe(Activity activity) {
        String name = activity.getName();
        return switch (activity.getType()) {
            case PLAYING -> "Jogando " + name;
            case STREAMING -> "Transmitindo " + name;
            case LISTENING -> "Ouvindo " + name;
            case WATCHING -> "Assistindo " + name;
            case COMPETING -> "Competindo em " + name;
            default -> name;
        };
    }

    private static String status(OnlineStatus status) {
        return switch (status) {
            case ONLINE -> "online";
            case IDLE -> "idle";
            case DO_NOT_DISTURB -> "dnd";
            default -> "offline";
        };
    }

    /** Discord's "no color" sentinel means the default name color; the client picks it. */
    private static String hexColor(int raw) {
        if (raw == Role.DEFAULT_COLOR_RAW) {
            return null;
        }
        return String.format("#%06x", raw & 0xFFFFFF);
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}
