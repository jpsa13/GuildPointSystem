package com.guild.app.auth.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.guild.app.characterstatus.service.SyncAccessService;
import com.guild.app.common.enums.MemberStatus;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/**
 * Depois do prazo, recusa (403 SYNC_REQUIRED) as requisicoes de membros aprovados que nao
 * sincronizaram a DLL recentemente. Login, a propria consulta de status e a ingestao do jogo
 * (sem JWT) continuam liberados para o membro conseguir se regularizar.
 *
 * Nao e @Component: o Spring Boot registraria tambem como filtro do servlet, e o
 * OncePerRequestFilter pularia a execucao dentro da cadeia de seguranca.
 */
public class SyncRequiredFilter extends OncePerRequestFilter {

    public static final String CODE = "SYNC_REQUIRED";

    private static final List<String> ALLOWED_PREFIXES = List.of(
            "/api/auth/",
            "/api/character-status/sync-access",
            "/api/seeds/",
            "/api/catalog/");

    private final SyncAccessService syncAccessService;
    private final ObjectMapper objectMapper;

    public SyncRequiredFilter(SyncAccessService syncAccessService, ObjectMapper objectMapper) {
        this.syncAccessService = syncAccessService;
        this.objectMapper = objectMapper;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return !path.startsWith("/api/") || ALLOWED_PREFIXES.stream().anyMatch(path::startsWith);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null
                && auth.getPrincipal() instanceof MemberPrincipal principal
                && principal.getStatus() == MemberStatus.APROVADO
                && syncAccessService.isBlocked(principal.getId(), principal.getCreatedAt())) {
            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            objectMapper.writeValue(response.getOutputStream(), Map.of(
                    "code", CODE,
                    "message", "Conta não sincronizada: instale a DLL e entre no jogo para liberar o acesso."));
            return;
        }
        chain.doFilter(request, response);
    }
}
