package com.guild.app.donation.dto;

import java.time.Instant;

public record DonationSettingsResponse(
        long pointsPerKk,
        String updatedByNickname,
        Instant updatedAt
) {}
