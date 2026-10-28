package com.guild.app.party.repository;

import com.guild.app.party.entity.PartyLfg;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface PartyLfgRepository extends JpaRepository<PartyLfg, Long> {

    @Query("SELECT l FROM PartyLfg l JOIN l.member m ORDER BY m.partyPriorityPoints DESC,l.queueOrder,l.memberId")
    List<PartyLfg> findAllInQueueOrder();

    @Query(value="SELECT nextval('party_lfg_order_seq')",nativeQuery=true)
    long nextQueueOrder();

    Optional<PartyLfg> findByMemberId(Long memberId);

    @Query("""
            SELECT l FROM PartyLfg l
            JOIN FETCH l.member m
            LEFT JOIN FETCH m.characterClass
            ORDER BY m.partyPriorityPoints DESC,l.queueOrder,l.memberId
            """)
    List<PartyLfg> findAllWithMemberOrderByCreatedAtAsc();
}
