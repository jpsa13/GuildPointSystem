package com.guild.app.party.dto;

import com.guild.app.common.enums.PartyMap;

import java.util.List;

public record MyPartyState(
        Long memberId,
        Long partyId,
        Integer partyNumber,
        PartyMap partyMap,
        String partySpot,
        boolean leader,
        boolean canOrganizeParties,
        PartyLfgEntry lfg,
        List<PartyPendingResponse> pending
) {}
