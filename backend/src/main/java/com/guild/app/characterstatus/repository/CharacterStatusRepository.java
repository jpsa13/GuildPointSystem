package com.guild.app.characterstatus.repository;

import com.guild.app.characterstatus.entity.CharacterStatus;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface CharacterStatusRepository extends JpaRepository<CharacterStatus, Long> {

    Optional<CharacterStatus> findByMemberIdAndGid(Long memberId, Long gid);

    /** Melhor personagem do membro (maior level, depois maior EXP) para level/EXP no party. */
    Optional<CharacterStatus> findFirstByMemberIdOrderByLevelDescExpPercentDesc(Long memberId);

    @EntityGraph(attributePaths = {"member"})
    List<CharacterStatus> findByMemberIdOrderByLevelDescExpPercentDesc(Long memberId);

    /** Ranking da guilda: todos os personagens, maior level/EXP primeiro. */
    @EntityGraph(attributePaths = {"member"})
    List<CharacterStatus> findAllByOrderByLevelDescExpPercentDesc();
}
