package com.guild.app.equipment.controller;

import com.guild.app.equipment.dto.EquipmentDtos.ClientEquipment;
import com.guild.app.equipment.service.EquipmentService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

/**
 * Ingestão do equipamento vestido enviada pela DLL do cliente. Sem autenticação: associada
 * ao membro pelo nome do personagem, como o status e as quests. Liberado no SecurityConfig.
 */
@RestController
@RequestMapping("/api/equipment-status")
@RequiredArgsConstructor
public class EquipmentStatusController {
    private final EquipmentService service;
    @PostMapping("/ingest")
    public Map<String,Object> ingest(@Valid @RequestBody ClientEquipment request) { return service.syncFromClient(request); }
}
