package com.guild.app.party.controller;

import com.guild.app.common.enums.PartyMap;
import com.guild.app.common.security.SecurityUtils;
import com.guild.app.party.dto.*;
import com.guild.app.party.service.PartyService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/parties")
@RequiredArgsConstructor
public class PartyController {

    private final PartyService partyService;

    @GetMapping("/board")
    public PartyBoardResponse board() {
        return partyService.getBoard(SecurityUtils.currentMember());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public PartyBoardResponse create(@Valid @RequestBody CreatePartyRequest request) {
        return partyService.createParty(request, SecurityUtils.currentMember());
    }

    @PostMapping("/for-member")
    @ResponseStatus(HttpStatus.CREATED)
    public PartyBoardResponse createForMember(@Valid @RequestBody CreatePartyForMemberRequest request) {
        return partyService.createPartyForMember(request, SecurityUtils.currentMember());
    }

    @PostMapping("/assemble")
    @ResponseStatus(HttpStatus.CREATED)
    public PartyBoardResponse assemble(@Valid @RequestBody AssemblePartyRequest request) {
        return partyService.assembleParty(request, SecurityUtils.currentMember());
    }

    @PostMapping("/empty")
    @ResponseStatus(HttpStatus.CREATED)
    public PartyBoardResponse createEmpty(@Valid @RequestBody CreatePartyRequest request) {
        return partyService.createEmptyParty(request, SecurityUtils.currentMember());
    }

    @PostMapping("/{id}/move")
    public PartyBoardResponse moveMember(
            @PathVariable Long id, @Valid @RequestBody MovePartyMemberRequest request) {
        return partyService.moveMember(id, request, SecurityUtils.currentMember());
    }

    @DeleteMapping("/{id}")
    public PartyBoardResponse disband(@PathVariable Long id) {
        return partyService.disband(id, SecurityUtils.currentMember());
    }

    @PostMapping("/{id}/leave")
    public PartyBoardResponse leave(@PathVariable Long id) {
        return partyService.leave(id, SecurityUtils.currentMember());
    }

    @PostMapping("/{id}/kick")
    public PartyBoardResponse kick(@PathVariable Long id, @Valid @RequestBody KickMemberRequest request) {
        return partyService.kickMember(id, request, SecurityUtils.currentMember());
    }

    @PostMapping("/{id}/leader")
    public PartyBoardResponse transferLeader(
            @PathVariable Long id, @Valid @RequestBody TransferPartyLeaderRequest request) {
        return partyService.transferLeader(id, request, SecurityUtils.currentMember());
    }

    @PostMapping("/{id}/members")
    public PartyBoardResponse addMember(@PathVariable Long id, @Valid @RequestBody AddPartyMemberRequest request) {
        return partyService.addMemberDirect(id, request, SecurityUtils.currentMember());
    }

    @PostMapping("/{id}/requests")
    public PartyBoardResponse requestJoin(@PathVariable Long id) {
        return partyService.requestJoin(id, SecurityUtils.currentMember());
    }

    @PostMapping("/{id}/invites")
    public PartyBoardResponse invite(@PathVariable Long id, @Valid @RequestBody InviteMemberRequest request) {
        return partyService.invite(id, request, SecurityUtils.currentMember());
    }

    @PostMapping("/pending/{pendingId}/accept")
    public PartyBoardResponse acceptPending(@PathVariable Long pendingId) {
        return partyService.acceptPending(pendingId, SecurityUtils.currentMember());
    }

    @PostMapping("/pending/{pendingId}/reject")
    public PartyBoardResponse rejectPending(@PathVariable Long pendingId) {
        return partyService.rejectPending(pendingId, SecurityUtils.currentMember());
    }

    @DeleteMapping("/pending/{pendingId}")
    public PartyBoardResponse cancelPending(@PathVariable Long pendingId) {
        return partyService.cancelPending(pendingId, SecurityUtils.currentMember());
    }

    @PutMapping("/lfg")
    public PartyBoardResponse upsertLfg(@Valid @RequestBody UpsertLfgRequest request) {
        return partyService.upsertLfg(request, SecurityUtils.currentMember());
    }

    @PostMapping("/lfg/all")
    public PartyBoardResponse addAllToLfg() {
        return partyService.addAllMembersToLfg(SecurityUtils.currentMember());
    }

    @DeleteMapping("/lfg")
    public PartyBoardResponse leaveLfg() {
        return partyService.leaveLfg(SecurityUtils.currentMember());
    }

    @DeleteMapping("/lfg/{memberId}")
    public PartyBoardResponse removeFromLfg(@PathVariable Long memberId) {
        return partyService.removeFromLfg(memberId, SecurityUtils.currentMember());
    }
}
