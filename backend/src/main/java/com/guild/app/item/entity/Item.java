package com.guild.app.item.entity;

import com.guild.app.common.enums.ItemType;
import com.guild.app.member.entity.Member;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "item")
@Getter
@Setter
public class Item {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ItemType type;

    @Column(length = 200)
    private String name;

    @Column(length = 50)
    private String rarity;

    @Column(name = "image_url", length = 500)
    private String imageUrl;

    @Column(name = "game_code", length = 50)
    private String gameCode;

    @Column(name = "lua_category", length = 20)
    private String luaCategory;

    @Column(columnDefinition = "TEXT")
    private String description;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by_id", nullable = false)
    private Member createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(nullable = false)
    private boolean deleted = false;
}
