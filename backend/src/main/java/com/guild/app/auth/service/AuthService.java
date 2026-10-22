package com.guild.app.auth.service;

import com.guild.app.auth.dto.AuthResponse;
import com.guild.app.auth.dto.DiscordProfileRequest;
import com.guild.app.auth.dto.LoginRequest;
import com.guild.app.auth.dto.RegisterRequest;
import com.guild.app.auth.security.JwtService;
import com.guild.app.auth.security.MemberPrincipal;
import com.guild.app.common.enums.AuditLogType;
import com.guild.app.common.enums.MemberStatus;
import com.guild.app.common.exception.AppException;
import com.guild.app.log.service.AuditLogService;
import com.guild.app.member.entity.Member;
import com.guild.app.member.entity.CharacterClass;
import com.guild.app.member.entity.GameRace;
import com.guild.app.member.policy.GuildRacePolicy;
import com.guild.app.member.repository.CharacterClassRepository;
import com.guild.app.member.repository.GameRaceRepository;
import com.guild.app.member.repository.MemberRepository;
import com.guild.app.websocket.WebSocketPublisher;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final MemberRepository memberRepository;
    private final GameRaceRepository gameRaceRepository;
    private final CharacterClassRepository characterClassRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final AuthenticationManager authenticationManager;
    private final AuditLogService auditLogService;
    private final WebSocketPublisher webSocketPublisher;

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        if (memberRepository.existsByEmail(request.email())) {
            throw new AppException("Este email já está cadastrado.", HttpStatus.CONFLICT);
        }
        var race = gameRaceRepository.findById(request.raceId())
                .orElseThrow(() -> new AppException("Raça inválida.", HttpStatus.BAD_REQUEST));
        GuildRacePolicy.requireCoraRaceForRegistration(race);
        var clazz = characterClassRepository.findById(request.classId())
                .orElseThrow(() -> new AppException("Classe inválida.", HttpStatus.BAD_REQUEST));
        validateClassForRace(clazz, race);

        var member = new Member();
        member.setEmail(request.email());
        member.setPasswordHash(passwordEncoder.encode(request.password()));
        member.setNickname(request.nickname());
        member.setRace(race);
        member.setCharacterClass(clazz);
        member.setAvatarUrl(request.avatarUrl());
        member.setStatus(MemberStatus.PENDENTE);
        member.setLevel(1);
        member.setProfileComplete(true);
        member = memberRepository.save(member);
        touchLastLogin(member);

        auditLogService.log(AuditLogType.MEMBER_REGISTERED, member, member,
                Map.of("email", request.email(), "nickname", request.nickname()));
        publishPending(member);

        return buildAuthResponse(member);
    }

    @Transactional
    public AuthResponse login(LoginRequest request) {
        authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.email(), request.password()));
        var member = memberRepository.findByEmail(request.email())
                .orElseThrow(() -> new AppException("Email ou senha incorretos.", HttpStatus.UNAUTHORIZED));
        touchLastLogin(member);
        return buildAuthResponse(member);
    }

    @Transactional
    public AuthResponse completeDiscordProfile(MemberPrincipal principal, DiscordProfileRequest request) {
        var member = memberRepository.findById(principal.getId())
                .orElseThrow(() -> new AppException("Membro não encontrado.", HttpStatus.NOT_FOUND));
        if (member.getDiscordId() == null) {
            throw new AppException("Esta conta não é do Discord.", HttpStatus.BAD_REQUEST);
        }
        var race = gameRaceRepository.findById(request.raceId())
                .orElseThrow(() -> new AppException("Raça inválida.", HttpStatus.BAD_REQUEST));
        GuildRacePolicy.requireCoraRaceForRegistration(race);
        var clazz = characterClassRepository.findById(request.classId())
                .orElseThrow(() -> new AppException("Classe inválida.", HttpStatus.BAD_REQUEST));
        validateClassForRace(clazz, race);

        member.setNickname(request.nickname());
        member.setRace(race);
        member.setCharacterClass(clazz);
        member.setProfileComplete(true);
        memberRepository.save(member);
        if (member.getStatus() == MemberStatus.PENDENTE) {
            // Race/class are now filled in: refresh the moderators' queue without a second toast.
            webSocketPublisher.publishApprovals(Map.of("type", "PENDING_CHANGED"));
        }
        return buildAuthResponse(member);
    }

    @Transactional
    public AuthResponse loginWithDiscord(String discordId, String nickname, String avatarUrl, String email) {
        var existing = memberRepository.findByDiscordId(discordId);
        if (existing.isPresent()) {
            var member = existing.get();
            if (member.getStatus() == MemberStatus.REJEITADO) {
                throw new AppException("Sua conta foi rejeitada.", HttpStatus.FORBIDDEN);
            }
            member.setNickname(nickname);
            member.setAvatarUrl(avatarUrl);
            if (email != null && !email.isBlank()) {
                member.setEmail(email);
            }
            touchLastLogin(member);
            return buildAuthResponse(member);
        }

        if (email != null && !email.isBlank() && memberRepository.existsByEmail(email)) {
            throw new AppException(
                    "Este email já está vinculado a outra conta. Faça login com email e senha.",
                    HttpStatus.CONFLICT);
        }

        var member = new Member();
        member.setDiscordId(discordId);
        member.setEmail(email);
        member.setNickname(nickname);
        member.setAvatarUrl(avatarUrl);
        member.setStatus(MemberStatus.PENDENTE);
        member.setLevel(1);
        member.setProfileComplete(false);
        member = memberRepository.save(member);
        touchLastLogin(member);

        auditLogService.log(AuditLogType.MEMBER_REGISTERED, member, member,
                Map.of("discordId", discordId, "nickname", nickname));
        publishPending(member);

        return buildAuthResponse(member);
    }

    /** A new registration is waiting for approval: moderators get a toast and the nav badge. */
    private void publishPending(Member member) {
        webSocketPublisher.publishApprovals(Map.of(
                "type", "MEMBER_PENDING",
                "memberId", member.getId(),
                "nickname", member.getNickname()));
    }

    /**
     * Renews the token of a member who is using the app, keeping the original login time. Fails (401) once
     * the session reached its maximum age, or for a rejected/deleted account: the member logs in again.
     */
    @Transactional(readOnly = true)
    public AuthResponse refresh(MemberPrincipal principal, String token) {
        var member = memberRepository.findById(principal.getId())
                .filter(m -> m.getStatus() != MemberStatus.EXCLUIDO && m.getStatus() != MemberStatus.REJEITADO)
                .orElseThrow(() -> new AppException("Sessão expirada. Entre novamente.", HttpStatus.UNAUTHORIZED));
        // Role/nickname/status come from the database, not from the old token.
        var renewed = jwtService.renew(token, new MemberPrincipal(member))
                .orElseThrow(() -> new AppException("Sessão expirada. Entre novamente.", HttpStatus.UNAUTHORIZED));
        return new AuthResponse(renewed, member.getId(), member.getNickname(), member.getRole(),
                member.getStatus(), resolveLevel(member), member.isProfileComplete());
    }

    private void touchLastLogin(Member member) {
        member.setLastLoginAt(Instant.now());
        memberRepository.save(member);
    }

    private AuthResponse buildAuthResponse(Member member) {
        var principal = new MemberPrincipal(member);
        return new AuthResponse(
                jwtService.generateToken(principal),
                member.getId(),
                member.getNickname(),
                member.getRole(),
                member.getStatus(),
                resolveLevel(member),
                member.isProfileComplete());
    }

    private static int resolveLevel(Member member) {
        return member.getLevel() != null ? member.getLevel() : 1;
    }

    private void validateClassForRace(CharacterClass clazz, GameRace race) {
        if (!clazz.getRace().getId().equals(race.getId())) {
            throw new AppException("A classe não pertence à raça selecionada.", HttpStatus.BAD_REQUEST);
        }
    }
}
