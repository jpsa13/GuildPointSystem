package com.guild.app.party.dto;

import java.time.Instant;
import java.util.List;

/** The part of the board that is the same for every member (no {@code my} state). */
public record PartyBoardSnapshot(
        List<PartySummary> parties,
        List<PartyLfgEntry> lfg,
        Instant serverTime
) {}
