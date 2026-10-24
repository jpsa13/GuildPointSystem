package com.guild.app.characterstatus.repository;

import com.guild.app.characterstatus.entity.CharacterStatus;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface CharacterStatusRepository extends JpaRepository<CharacterStatus, Long> {

    Optional<CharacterStatus> findByMemberIdAndGid(Long memberId, Long gid);

    /** Maior level de jogo conhecido do membro (pode ter varios personagens). */
    @Query("SELECT MAX(cs.level) FROM CharacterStatus cs WHERE cs.member.id = :memberId")
    Optional<Integer> findMaxLevelByMemberId(Long memberId);

    @EntityGraph(attributePaths = {"member"})
    List<CharacterStatus> findByMemberIdOrderByLevelDescExpPercentDesc(Long memberId);

    /** Ranking da guilda: todos os personagens, maior level/EXP primeiro. */
    @EntityGraph(attributePaths = {"member"})
    List<CharacterStatus> findAllByOrderByLevelDescExpPercentDesc();
}
