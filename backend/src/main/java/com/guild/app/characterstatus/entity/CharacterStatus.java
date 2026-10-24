package com.guild.app.characterstatus.entity;

import com.guild.app.member.entity.Member;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

/**
 * Ultimo status conhecido de um personagem (member + gid), enviado pelo cliente.
 * Dado do cliente, nao autoritativo: exibicao apenas. Guardamos so o estado atual.
 */
@Entity
@Table(name = "character_status")
@Getter
@Setter
public class CharacterStatus {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    /** Identificador do personagem no jogo (muda por personagem). */
    @Column(nullable = false)
    private Long gid;

    @Column(name = "character_name", nullable = false, length = 32)
    private String characterName;

    @Column(nullable = false)
    private Integer level;

    @Column(name = "exp_percent", nullable = false)
    private Float expPercent;

    @Column(nullable = false)
    private Integer hp;

    @Column(name = "hp_max", nullable = false)
    private Integer hpMax;

    @Column(nullable = false)
    private Integer fp;

    @Column(name = "fp_max", nullable = false)
    private Integer fpMax;

    @Column(nullable = false)
    private Integer sp;

    @Column(name = "sp_max", nullable = false)
    private Integer spMax;

    /** Quando o cliente observou (recebido) e quando o servidor gravou. */
    @Column(name = "observed_at", nullable = false)
    private Instant observedAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();
}
