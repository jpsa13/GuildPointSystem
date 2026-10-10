package com.guild.app.item.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(
        name = "game_lua_item",
        uniqueConstraints = @UniqueConstraint(
                name = "uq_game_lua_item_category_code",
                columnNames = { "category", "game_code" }))
@Getter
@Setter
public class GameLuaItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 20)
    private String category;

    @Column(name = "game_index", nullable = false)
    private Integer gameIndex = 0;

    @Column(name = "game_code", nullable = false, length = 50)
    private String gameCode;

    @Column(nullable = false, length = 200)
    private String name;

    @Column(name = "icon_id", nullable = false)
    private Integer iconId = 0;

    @Column(name = "sprite_sheet", nullable = false, length = 500)
    private String spriteSheet;

    @Column(name = "sprite_cols", nullable = false)
    private Integer spriteCols = 32;

    @Column(name = "item_grade", nullable = false)
    private Integer itemGrade = 0;

    @Column(name = "level_required", nullable = false)
    private Integer levelRequired = 0;
}
