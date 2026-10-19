package com.guild.app.donation.repository;

import com.guild.app.common.enums.DonationStatus;
import com.guild.app.donation.entity.Donation;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface DonationRepository extends JpaRepository<Donation, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT d FROM Donation d WHERE d.id = :id")
    Optional<Donation> findByIdForUpdate(Long id);

    /** Oldest first: the review queue. */
    @EntityGraph(attributePaths = {"member"})
    List<Donation> findByStatusOrderByCreatedAtAscIdAsc(DonationStatus status);

    @EntityGraph(attributePaths = {"member", "reviewedBy"})
    Page<Donation> findByMemberIdOrderByCreatedAtDescIdDesc(Long memberId, Pageable pageable);
}
