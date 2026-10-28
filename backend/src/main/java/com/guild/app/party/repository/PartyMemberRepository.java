package com.guild.app.party.repository;

import com.guild.app.party.entity.PartyMember;
import com.guild.app.party.entity.PartyMemberId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface PartyMemberRepository extends JpaRepository<PartyMember, PartyMemberId> {

    Optional<PartyMember> findByMemberId(Long memberId);

    @Query("SELECT pm FROM PartyMember pm WHERE pm.afkUntil<=:now ORDER BY pm.partyId,pm.memberId")
    List<PartyMember> findAfkDue(java.time.Instant now);

    long countByPartyId(Long partyId);

    List<PartyMember> findByPartyIdOrderByJoinedAtAsc(Long partyId);

    void deleteByPartyIdAndMemberId(Long partyId, Long memberId);

    @Query("SELECT pm FROM PartyMember pm JOIN FETCH pm.member m LEFT JOIN FETCH m.characterClass WHERE pm.partyId IN :partyIds")
    List<PartyMember> findByPartyIdInWithMember(List<Long> partyIds);
}
