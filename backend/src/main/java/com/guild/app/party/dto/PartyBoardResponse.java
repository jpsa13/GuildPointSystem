package com.guild.app.party.dto;

import java.time.Instant;
import java.util.List;

/**
 * {@code lfg} is ordered by waiting time (longest first). {@code serverTime} lets clients run the
 * waiting timers on the server clock and discard a board snapshot older than the one they hold.
 */
public record PartyBoardResponse(
        List<PartySummary> parties,
        List<PartyLfgEntry> lfg,
        MyPartyState my,
        Instant serverTime
) {}
