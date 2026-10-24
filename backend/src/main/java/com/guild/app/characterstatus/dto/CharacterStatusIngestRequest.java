package com.guild.app.characterstatus.dto;

import jakarta.validation.constraints.*;

/**
 * Corpo enviado pelo cliente CerberusBags. As chaves correspondem exatamente ao
 * JSON montado na DLL (gid, character, level, expPercent, hp, hpMax, ...).
 */
public record CharacterStatusIngestRequest(
        @NotNull @Positive Long gid,
        @NotBlank @Size(max = 32) String character,
        @NotNull @Min(1) @Max(200) Integer level,
        @NotNull @DecimalMin("0.0") @DecimalMax("100.0") Float expPercent,
        @NotNull @Min(0) Integer hp,
        @NotNull @Min(1) Integer hpMax,
        @NotNull @Min(0) Integer fp,
        @NotNull @Min(0) Integer fpMax,
        @NotNull @Min(0) Integer sp,
        @NotNull @Min(0) Integer spMax
) {}
