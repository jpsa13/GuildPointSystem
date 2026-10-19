package com.guild.app.donation.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record CreateDonationRequest(
        @NotNull(message = "Informe a quantidade de disena.")
        @Min(value = 1, message = "A doação mínima é 1kk.")
        @Max(value = 1_000_000, message = "Quantidade de disena inválida.")
        Long amountKk
) {}
