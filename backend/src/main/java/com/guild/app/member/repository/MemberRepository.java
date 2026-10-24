package com.guild.app.member.repository;

import com.guild.app.common.enums.Role;
import com.guild.app.member.entity.Member;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import jakarta.persistence.LockModeType;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface MemberRepository extends JpaRepository<Member, Long> {

    Optional<Member> findByEmail(String email);

    /** Casamento do personagem (nome unico no jogo) com o membro, sem diferenciar caixa. */
    Optional<Member> findByNicknameIgnoreCase(String nickname);

    Optional<Member> findByDiscordId(String discordId);

    List<Member> findByDiscordIdIn(Collection<String> discordIds);

    boolean existsByEmail(String email);

    boolean existsByDiscordId(String discordId);

    Optional<Member> findByRole(Role role);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT m FROM Member m WHERE m.id = :id")
    Optional<Member> findByIdForUpdate(Long id);

    List<Member> findByStatusOrderByPointsDesc(com.guild.app.common.enums.MemberStatus status);

    @Query("SELECT m FROM Member m LEFT JOIN FETCH m.characterClass WHERE m.id IN :ids")
    List<Member> findAllByIdInWithClass(Collection<Long> ids);
}
