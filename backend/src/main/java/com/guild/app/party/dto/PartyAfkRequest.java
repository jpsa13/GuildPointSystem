package com.guild.app.party.dto;

import jakarta.validation.constraints.NotNull;

public record PartyAfkRequest(@NotNull Boolean active) {}
