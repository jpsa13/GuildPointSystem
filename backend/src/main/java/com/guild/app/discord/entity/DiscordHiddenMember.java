package com.guild.app.discord.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "discord_hidden_member")
@Getter
@Setter
@NoArgsConstructor
public class DiscordHiddenMember {

    @Id
    @Column(name = "discord_id", length = 32)
    private String discordId;

    @Column(name = "hidden_by")
    private Long hiddenBy;

    @Column(name = "hidden_at", nullable = false)
    private Instant hiddenAt = Instant.now();

    public DiscordHiddenMember(String discordId, Long hiddenBy) {
        this.discordId = discordId;
        this.hiddenBy = hiddenBy;
    }
}
