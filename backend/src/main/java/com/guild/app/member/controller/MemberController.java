package com.guild.app.member.controller;

import com.guild.app.common.security.SecurityUtils;
import com.guild.app.event.dto.EventClaimResponse;
import com.guild.app.event.dto.ManualEventRequest;
import com.guild.app.event.service.EventService;
import com.guild.app.member.dto.ApprovalRequest;
import com.guild.app.member.dto.MemberResponse;
import com.guild.app.member.dto.UpdateProfileRequest;
import com.guild.app.member.dto.UpdateRoleRequest;
import com.guild.app.member.service.MemberService;
import com.guild.app.points.dto.PointsAdjustmentRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/members")
@RequiredArgsConstructor
public class MemberController {

    private final MemberService memberService;
    private final EventService eventService;

    @GetMapping("/ranking")
    public List<MemberResponse> ranking() {
        return memberService.getRanking();
    }

    @GetMapping("/pending")
    public List<MemberResponse> pending() {
        return memberService.getPending();
    }

    @GetMapping("/{id}")
    public MemberResponse getById(@PathVariable Long id) {
        return memberService.getById(id);
    }

    @GetMapping("/me")
    public MemberResponse me() {
        return memberService.getById(SecurityUtils.currentMember().getId());
    }

    @PutMapping("/{id}/profile")
    public MemberResponse updateProfile(@PathVariable Long id, @Valid @RequestBody UpdateProfileRequest request) {
        return memberService.updateProfile(id, request, SecurityUtils.currentMember());
    }

    @PatchMapping("/{id}/approval")
    public MemberResponse approve(@PathVariable Long id, @Valid @RequestBody ApprovalRequest request) {
        return memberService.approve(id, request, SecurityUtils.currentMember());
    }

    @PostMapping("/{id}/points")
    public MemberResponse adjustPoints(@PathVariable Long id, @Valid @RequestBody PointsAdjustmentRequest request) {
        return memberService.adjustPoints(id, request, SecurityUtils.currentMember());
    }

    @GetMapping("/{id}/claims")
    public List<EventClaimResponse> memberClaims(@PathVariable Long id) {
        return eventService.listClaimsForMember(id);
    }

    @PostMapping("/{id}/manual-event")
    @ResponseStatus(HttpStatus.CREATED)
    public EventClaimResponse grantManualEvent(@PathVariable Long id, @Valid @RequestBody ManualEventRequest request) {
        return eventService.grantManualToMember(id, request.objectiveId(), SecurityUtils.currentMember());
    }

    @PostMapping("/{id}/promote-leader")
    public MemberResponse promoteToLeader(@PathVariable Long id) {
        return memberService.promoteToLeader(id, SecurityUtils.currentMember());
    }

    /** Líder/Administrador: delete a member's account (history kept, login and personal data wiped). */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteAccount(@PathVariable Long id) {
        memberService.deleteAccount(id, SecurityUtils.currentMember());
    }

    @PatchMapping("/{id}/role")
    public MemberResponse updateRole(@PathVariable Long id, @Valid @RequestBody UpdateRoleRequest request) {
        return memberService.updateRole(id, request, SecurityUtils.currentMember());
    }
}
