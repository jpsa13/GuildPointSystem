package com.guild.app.donation.controller;

import com.guild.app.common.security.SecurityUtils;
import com.guild.app.donation.dto.CreateDonationRequest;
import com.guild.app.donation.dto.DonationResponse;
import com.guild.app.donation.dto.DonationSettingsRequest;
import com.guild.app.donation.dto.DonationSettingsResponse;
import com.guild.app.donation.service.DonationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/donations")
@RequiredArgsConstructor
public class DonationController {

    private final DonationService donationService;

    @GetMapping("/settings")
    public DonationSettingsResponse settings() {
        return donationService.getSettings();
    }

    /** Líder/Administrador. */
    @PutMapping("/settings")
    public DonationSettingsResponse updateSettings(@Valid @RequestBody DonationSettingsRequest request) {
        return donationService.updateSettings(request, SecurityUtils.currentMember());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public DonationResponse create(@Valid @RequestBody CreateDonationRequest request) {
        return donationService.create(request, SecurityUtils.currentMember());
    }

    @GetMapping("/mine")
    public Page<DonationResponse> mine(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        return donationService.listMine(SecurityUtils.currentMember(), page, size);
    }

    /** Líder/Administrador. */
    @GetMapping("/pending")
    public List<DonationResponse> pending() {
        return donationService.listPending();
    }

    /** Líder/Administrador. */
    @PostMapping("/{id}/accept")
    public DonationResponse accept(@PathVariable Long id) {
        return donationService.accept(id, SecurityUtils.currentMember());
    }

    /** Líder/Administrador. */
    @PostMapping("/{id}/reject")
    public DonationResponse reject(@PathVariable Long id) {
        return donationService.reject(id, SecurityUtils.currentMember());
    }
}
