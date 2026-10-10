package com.guild.app.item.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;

@Entity
@Table(name = "game_armor")
@Getter
@Setter
public class GameArmor {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "game_code", nullable = false, unique = true, length = 50)
    private String gameCode;

    @Column(nullable = false, length = 200)
    private String name;

    @Column(nullable = false, length = 20)
    private String slot;

    @Column(name = "icon_id", nullable = false)
    private Integer iconId = 0;

    @Column(name = "sprite_sheet", nullable = false, length = 500)
    private String spriteSheet;

    @Column(name = "sprite_cols", nullable = false)
    private Integer spriteCols = 32;

    @Column(nullable = false)
    private Integer grade = 0;

    @Column(name = "civil_mask", nullable = false, length = 20)
    private String civilMask = "11111000";

    @Column(name = "level_required", nullable = false)
    private Integer levelRequired = 0;

    @Column(name = "def_fc", nullable = false)
    private Integer defFc = 0;

    @Column(name = "def_facing", precision = 16, scale = 12)
    private BigDecimal defFacing;

    @Column(name = "eff_code_1")
    private Integer effCode1;

    @Column(name = "eff_unit_1", precision = 10, scale = 6)
    private BigDecimal effUnit1;

    @Column(name = "eff_code_2")
    private Integer effCode2;

    @Column(name = "eff_unit_2", precision = 10, scale = 6)
    private BigDecimal effUnit2;

    @Column(name = "eff_code_3")
    private Integer effCode3;

    @Column(name = "eff_unit_3", precision = 10, scale = 6)
    private BigDecimal effUnit3;

    @Column(name = "eff_code_4")
    private Integer effCode4;

    @Column(name = "eff_unit_4", precision = 10, scale = 6)
    private BigDecimal effUnit4;
}
