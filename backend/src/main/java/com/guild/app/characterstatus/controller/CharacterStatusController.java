package com.guild.app.characterstatus.controller;

import com.guild.app.auth.security.MemberPrincipal;
import com.guild.app.characterstatus.dto.CharacterStatusIngestRequest;
import com.guild.app.characterstatus.dto.CharacterStatusView;
import com.guild.app.characterstatus.service.CharacterStatusService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/character-status")
@RequiredArgsConstructor
public class CharacterStatusController {

    private final CharacterStatusService service;

    /**
     * Ingestao do cliente CerberusBags. Sem autenticacao: o status e associado ao
     * membro pelo nome do personagem (unico no jogo). Liberado no SecurityConfig.
     */
    @PostMapping("/ingest")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void ingest(@Valid @RequestBody CharacterStatusIngestRequest request) {
        service.ingest(request);
    }

    /** Ranking da guilda: todos os personagens que ativaram o envio. */
    @GetMapping("/ranking")
    public List<CharacterStatusView> ranking() {
        return service.ranking();
    }

    @GetMapping("/me")
    public List<CharacterStatusView> myStatuses(@AuthenticationPrincipal MemberPrincipal principal) {
        return service.myStatuses(principal.getId());
    }
}
