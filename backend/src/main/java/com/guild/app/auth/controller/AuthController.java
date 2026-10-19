package com.guild.app.auth.controller;

import com.guild.app.auth.dto.*;
import com.guild.app.auth.security.MemberPrincipal;
import com.guild.app.auth.service.AuthService;
import com.guild.app.common.security.SecurityUtils;
import jakarta.validation.Valid;
import com.guild.app.member.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final MemberRepository memberRepository;

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public AuthResponse register(@Valid @RequestBody RegisterRequest request) {
        return authService.register(request);
    }

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest request) {
        return authService.login(request);
    }

    @PostMapping("/discord/complete-profile")
    public AuthResponse completeDiscordProfile(@Valid @RequestBody DiscordProfileRequest request) {
        return authService.completeDiscordProfile(SecurityUtils.currentMember(), request);
    }

    /** New token for the same login while the member is active (see JwtService). */
    @PostMapping("/refresh")
    public AuthResponse refresh(@RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization) {
        var member = SecurityUtils.currentMember(); // 401 without a valid token
        var token = authorization.startsWith("Bearer ") ? authorization.substring(7) : authorization;
        return authService.refresh(member, token);
    }

    @GetMapping("/me")
    public AuthResponse me(@AuthenticationPrincipal MemberPrincipal principal) {
        var member = memberRepository.findById(principal.getId()).orElseThrow();
        return new AuthResponse(
                null,
                member.getId(),
                member.getNickname(),
                member.getRole(),
                member.getStatus(),
                member.getLevel() != null ? member.getLevel() : 1,
                member.isProfileComplete());
    }
}
