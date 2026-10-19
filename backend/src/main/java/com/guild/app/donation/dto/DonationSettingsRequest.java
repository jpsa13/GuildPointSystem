package com.guild.app.donation.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record DonationSettingsRequest(
        @NotNull(message = "Informe quantos pontos vale cada 1kk.")
        @Min(value = 1, message = "Cada 1kk precisa valer pelo menos 1 ponto.")
        @Max(value = 1_000_000, message = "Valor em pontos alto demais.")
        Long pointsPerKk
) {}
