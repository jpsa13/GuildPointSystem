package com.guild.app.emoji.entity;

import com.guild.app.member.entity.Member;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "guild_emoji")
@Getter
@Setter
public class GuildEmoji {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Used as {@code :name:} in reactions and messages; unique ignoring case. */
    @Column(nullable = false, length = 32)
    private String name;

    @Column(name = "image_url", nullable = false, length = 500)
    private String imageUrl;

    @Column(nullable = false)
    private boolean animated;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by_id")
    private Member createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();
}
