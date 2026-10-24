package com.guild.app.quest.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.math.BigDecimal;

public final class QuestDtos {
    private QuestDtos() {}
    public enum State { PRESENT, COMPLETION_SIGNAL, REMOVED_UNKNOWN, STATE_CHANGED }
    public record PairRequest(@NotBlank @Pattern(regexp="[A-Za-z0-9._-]{1,40}") String monitorVersion) {}
    public record Pairing(UUID sessionId, String token, Instant expiresAt) {}
    public record LivePairRequest(@NotBlank @Pattern(regexp="[A-Za-z0-9._-]{1,40}") String monitorVersion,
        @NotBlank @Pattern(regexp="[\\p{L}\\p{N}_-]{1,32}") String expectedName) {}
    public record CatalogQuest(String code,String title,String definitionHash) {}
    public record VisibilityRequest(boolean hidden) {}
    public record DailyQuest(CatalogQuest quest,String npcName,List<String> npcCodes,List<Integer> races,List<String> objectives) {}
    public record NpcCoverage(String name,List<String> npcCodes,int questCount) {}
    public record CouponCatalog(List<DailyQuest> quests,List<NpcCoverage> npcs,java.util.Map<String,String> sourceHashes) {}
    public record ExpectedQuest(DailyQuest definition,long completionSignals,boolean hidden) {}
    public record QuestBrief(@NotBlank @Pattern(regexp="Q[0-9A-F]{6}") String code,
        @NotBlank @Pattern(regexp="[a-f0-9]{64}") String definitionHash,
        @NotNull @Size(max=200) String title,@Min(0) @Max(2) int group,@Min(0) @Max(255) int type,@Min(0) @Max(255) int slot) {}
    public enum SampleStatus { OBSERVED, UNAVAILABLE }
    public record PlayerSample(@Min(0) long sequence,@NotNull Instant sampledAt,@NotNull SampleStatus status,
        @NotBlank @Pattern(regexp="[\\p{L}\\p{N}_-]{1,32}") String name,
        @Min(1) @Max(4294967294L) long serial,
        @NotBlank @Pattern(regexp="[a-f0-9]{64}") String identityEpoch,
        @Min(1) @Max(150) int level,
        @DecimalMin("0") @DecimalMax("100") @Digits(integer=3,fraction=6) BigDecimal xpPercent,
        @NotNull @Size(max=765) List<@NotNull @Valid QuestBrief> quests) {}
    public record LiveBatch(@NotNull @Valid PlayerSample sample,@NotNull @Size(max=100) List<@NotNull @Valid Event> events) {}
    public record PlayerStatus(UUID sessionId,PlayerSample sample,Instant receivedAt,boolean revoked) {}
    public record Session(UUID id, String monitorVersion, String source, Instant createdAt,
                          Instant expiresAt, Instant revokedAt, Instant lastReceivedAt) {}
    public record Event(
        @NotNull UUID eventId, @NotNull UUID runId, @Min(0) int sequence,
        @NotNull Instant occurredAt,
        @NotBlank @Pattern(regexp="Q[0-9A-F]{6}") String code,
        @NotNull @Size(max=200) String title,
        @NotBlank @Pattern(regexp="[a-f0-9]{64}") String clientHash,
        @NotBlank @Pattern(regexp="[a-f0-9]{64}") String edfHash,
        @NotBlank @Pattern(regexp="[a-f0-9]{64}") String definitionHash,
        @Min(0) @Max(2) int group, @Min(0) @Max(255) int type,
        @Min(0) @Max(255) int slot, @NotNull State state) {}
    public record Batch(@NotEmpty @Size(max=100) List<@NotNull @Valid Event> events) {}
    public record Observation(UUID sessionId, String source, String monitorVersion, Event event, Instant receivedAt) {}
    public record History(long memberId, boolean simulationEnabled, List<Session> sessions,
                          List<Observation> events, boolean hasMore, long nextOffset,
                          boolean liveEnabled,PlayerStatus player,List<ExpectedQuest> expected,List<NpcCoverage> npcCoverage) {}
}
