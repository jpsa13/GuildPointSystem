package com.guild.app.party.dto;

import java.util.Collection;

/**
 * Broadcast on {@code /topic/parties}. Clients apply {@code board} directly; only members listed in
 * {@code pendingMemberIds} (and organizers, when {@code joinRequestsChanged}) refetch their personal
 * state. A null {@code board} means the snapshot could not be built: every client refetches.
 */
public record PartyBoardUpdateMessage(
        String type,
        PartyBoardSnapshot board,
        Collection<Long> pendingMemberIds,
        boolean joinRequestsChanged
) {}
