package com.guild.app.quest.dto;

import jakarta.validation.constraints.*;

import java.util.List;

/**
 * Corpo enviado pelo cliente CerberusBags (monitor de quests). As chaves batem
 * com o JSON da DLL: character, active (codigos ativos), done (codigos que
 * sumiram do journal no dia = concluidos, com imprecisao). Codigos sao inteiros.
 */
public record QuestStatusIngestRequest(
        @NotBlank @Size(max = 32) String character,
        @NotNull @Size(max = 500) List<@NotNull @Min(0) @Max(0xFFFFFF) Integer> active,
        @NotNull @Size(max = 500) List<@NotNull @Min(0) @Max(0xFFFFFF) Integer> done
) {}
