package com.guild.app.party.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.Instant;
import java.util.*;

@Entity @Table(name="party_discord_call") @Getter @Setter
public class PartyDiscordCall {
    public record Recipient(Long memberId, String discordId, String nickname) {}
    @Id private Long partyId;
    @Column(nullable=false) private UUID runId;
    @Column(nullable=false) private Long actorId;
    @Column(nullable=false,length=300) private String label;
    @Column(nullable=false,length=24) private String channelId;
    @Column(nullable=false) private Instant startedAt;
    @Column(nullable=false) private Instant nextAt;
    @Column(nullable=false,length=20) private String state;
    @Column(nullable=false) private int sent;
    @JdbcTypeCode(SqlTypes.JSON) @Column(nullable=false,columnDefinition="jsonb")
    private List<Recipient> recipients=new ArrayList<>();
    @JdbcTypeCode(SqlTypes.JSON) @Column(nullable=false,columnDefinition="jsonb")
    private Set<String> confirmed=new HashSet<>();
    @JdbcTypeCode(SqlTypes.JSON) @Column(nullable=false,columnDefinition="jsonb")
    private List<String> messages=new ArrayList<>();
    @JdbcTypeCode(SqlTypes.JSON) @Column(nullable=false,columnDefinition="jsonb")
    private List<String> skipped=new ArrayList<>();
    @Column(length=300) private String error;
}
