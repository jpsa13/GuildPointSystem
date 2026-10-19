package com.guild.app.donation.dto;

import com.guild.app.common.enums.DonationStatus;

import java.time.Instant;

public record DonationResponse(
        Long id,
        Long memberId,
        String memberNickname,
        long amountKk,
        DonationStatus status,
        Instant createdAt,
        String reviewedByNickname,
        Instant reviewedAt,
        Long pointsPerKk,
        Long pointsAwarded
) {}
