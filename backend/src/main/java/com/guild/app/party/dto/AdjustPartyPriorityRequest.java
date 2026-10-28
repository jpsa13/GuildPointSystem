package com.guild.app.party.dto;

import jakarta.validation.constraints.*;

public record AdjustPartyPriorityRequest(@NotNull @Min(-1) @Max(1) Integer delta) {}
