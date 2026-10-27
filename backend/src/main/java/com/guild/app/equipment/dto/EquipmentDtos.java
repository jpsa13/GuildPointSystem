package com.guild.app.equipment.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class EquipmentDtos {
    private EquipmentDtos() {}

    public enum Slot {
        Weapon("WEAPON"), Weapon2("WEAPON"), Helmet("HELMET"), Upper("UPPER"), Lower("LOWER"),
        Gloves("GLOVES"), Shoes("SHOES"), Amulet1("AMULET"), Amulet2("AMULET"), Ring1("RING"), Ring2("RING"), Cloak("CLOAK");
        public final String category;
        Slot(String category) { this.category = category; }
    }
    public enum Action { CREATE, EQUIP, CORRECT, CANCEL, TRANSFER }
    public enum Origin { INITIAL, GUILD_DISTRIBUTION }
    public enum Restoration { EMPTY, PREVIOUS }
    public record Effect(String key, Integer code, String name, String displayType, BigDecimal value,
                         String description, String unitHint) {}
    public record CatalogItem(long id, String category, String gameCode, String name, int level, int grade,
                              List<Effect> effects, Integer iconId, String sourceHash, String effectsNote) {}
    public record CatalogPage(List<CatalogItem> items, long total, int page, int size, List<String> abilities, List<Integer> weaponTypes) {}
    @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
    public record Assignment(long id, long memberId, Slot slot, long catalogId, String gameCode, String name,
                             int level, int grade, String category, Effect effect, Origin origin, LocalDate occurredOn,
                             Long actorId, String actorName, Instant createdAt, String status, Long correctsId, String reason,
                             Integer iconId, String sourceHash, String statusReason, String statusActorName, Instant statusChangedAt, GearScore gearScore, Boolean deliveryOnly) {
        public Assignment withoutAudit() {
            return new Assignment(id,memberId,slot,catalogId,gameCode,name,level,grade,category,effect,
                null,null,null,null,null,null,null,null,iconId,sourceHash,null,null,null,gearScore,null);
        }
    }
    public record ReviewRequest(@NotNull UUID operationId, @NotNull @Positive Long memberId) {}
    public record RelicState(@NotNull Boolean active) {}
    public record ReviewStatus(UUID id, long memberId, Instant requestedAt, Instant dueAt, Instant confirmedAt,
                               String status, boolean overdue) {}
    public record CurrentSlot(Slot slot, long version, Assignment assignment) {}
    public record SlotVersion(@NotNull Slot slot, @NotNull @Min(0) Long expectedVersion) {}
    public record SlotEdit(@NotNull UUID operationId, @NotNull @Positive Long memberId,
                           @NotNull @Size(min=1,max=12) List<@NotNull @Valid SlotVersion> slots, UUID reversesOperationId) {}
    public record SlotEditResult(UUID operationId, long memberId, List<CurrentSlot> slots) {}
    public record GearScore(Integer points, Integer originalLevel, boolean included) {}
    public record GearScoreTotal(int total,int weapon,int armor,int accessories,int unscored) {}
    public record MemberEquipment(long memberId, String nickname, int level, Float expPercent, Long classId, String className, String classImageUrl, List<CurrentSlot> slots) {
        @com.fasterxml.jackson.annotation.JsonProperty("gearScore")
        public GearScoreTotal gearScore() {
            int weapon=0,armor=0,accessories=0,unscored=0;
            for (var slot:slots) {
                if (slot.assignment()==null || slot.slot()==Slot.Cloak) continue;
                var score=slot.assignment().gearScore();
                if (score==null || score.points()==null) { unscored++; continue; }
                switch(slot.slot().category) {
                    case "WEAPON" -> weapon=Math.max(weapon,score.points());
                    case "RING","AMULET" -> accessories+=score.points();
                    default -> armor+=score.points();
                }
            }
            return new GearScoreTotal(weapon+armor+accessories,weapon,armor,accessories,unscored);
        }
    }
    public record Transfer(@NotNull @Positive Long memberId, Slot slot,
                           @NotNull @Min(0) Long expectedVersion, boolean replaceCurrent) {}
    public record Operation(@NotNull UUID operationId, @NotNull Action action, @NotNull @Positive Long memberId,
                            @NotNull Slot slot, @NotNull @Min(0) Long expectedVersion,
                            Long assignmentId, Long catalogId, @Size(max=100) String effectKey,
                            Origin origin, @PastOrPresent LocalDate occurredOn, boolean useAsCurrent,
                            Long replacementId, Restoration restoration, @Size(max=500) String reason,
                            @Valid Transfer transfer, @DecimalMin("1") @DecimalMax("100") @Digits(integer=3,fraction=0) BigDecimal quantity) {
        public Operation(UUID operationId, Action action, Long memberId, Slot slot, Long expectedVersion,
                         Long assignmentId, Long catalogId, String effectKey, Origin origin, LocalDate occurredOn,
                         boolean useAsCurrent, Long replacementId, Restoration restoration, String reason) {
            this(operationId,action,memberId,slot,expectedVersion,assignmentId,catalogId,effectKey,origin,
                occurredOn,useAsCurrent,replacementId,restoration,reason,null,null);
        }
        public Operation(UUID operationId, Action action, Long memberId, Slot slot, Long expectedVersion,
                         Long assignmentId, Long catalogId, String effectKey, Origin origin, LocalDate occurredOn,
                         boolean useAsCurrent, Long replacementId, Restoration restoration, String reason, Transfer transfer) {
            this(operationId,action,memberId,slot,expectedVersion,assignmentId,catalogId,effectKey,origin,
                occurredOn,useAsCurrent,replacementId,restoration,reason,transfer,null);
        }
    }
    public record ImportEffect(@NotNull @Positive Integer code, @NotNull @DecimalMin("-1000000000") @DecimalMax("1000000000") BigDecimal value) {}
    public record ImportItem(@NotBlank String category, @NotBlank @Pattern(regexp="[a-z0-9]{2,50}") String gameCode,
                             @NotBlank @Size(max=200) String name, @Min(0) @Max(99) int level,
                             @Min(0) @Max(255) int grade, @NotNull @Size(max=4) List<@NotNull @Valid ImportEffect> effects,
                             @Min(0) @Max(65535) Integer iconId, @Size(max=30) String itemType, @Size(max=300) String effectsNote,
                             @Pattern(regexp="[01]{5}") String civil, @Min(0) @Max(255) Integer expertId) {}
    public record ExcludedItem(@NotBlank String category, @NotBlank @Pattern(regexp="(?:[a-z0-9]{2,50}|hex:[a-f0-9]{2,40})") String gameCode,
                               @Size(max=200) String reason) {}
    public record ImportRequest(@NotNull @Pattern(regexp="[a-f0-9]{64}") String sourceHash,
                                @NotNull @Size(min=1,max=60000) List<@NotNull @Valid ImportItem> items,
                                @NotNull @Size(max=5000) List<@NotNull @Valid ExcludedItem> excluded) {}
}
