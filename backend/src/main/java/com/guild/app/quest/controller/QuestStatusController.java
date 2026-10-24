package com.guild.app.quest.controller;

import com.guild.app.quest.dto.QuestStatusIngestRequest;
import com.guild.app.quest.service.QuestStatusService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

/**
 * Ingestao do monitor de quests do cliente CerberusBags. Sem autenticacao: o
 * status e associado ao membro pelo nome do personagem. Liberado no SecurityConfig.
 */
@RestController
@RequestMapping("/api/quest-status")
@RequiredArgsConstructor
public class QuestStatusController {

    private final QuestStatusService service;

    @PostMapping("/ingest")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void ingest(@Valid @RequestBody QuestStatusIngestRequest request) {
        service.ingest(request);
    }
}
