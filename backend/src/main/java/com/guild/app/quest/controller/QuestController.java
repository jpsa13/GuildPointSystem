package com.guild.app.quest.controller;

import com.guild.app.quest.dto.QuestDtos.*;
import com.guild.app.quest.service.QuestService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/quests")
@RequiredArgsConstructor
public class QuestController {
    private final QuestService service;
    @GetMapping public History history(@RequestParam LocalDate day, @RequestParam(defaultValue="true") boolean resetPeriod,
                                       @RequestParam(defaultValue="0") long offset) { return service.history(day,resetPeriod,offset); }
    @PostMapping("/sessions") public Pairing pair(@Valid @RequestBody PairRequest request) { return service.pair(request); }
    @PostMapping("/live/sessions") public Pairing pairLive(@Valid @RequestBody LivePairRequest request) { return service.pairLive(request); }
    @PatchMapping("/catalog/{hash}/visibility")
    @org.springframework.security.access.prepost.PreAuthorize("hasAnyRole('ADMINISTRADOR','LIDER')")
    public void visibility(@PathVariable String hash,@Valid @RequestBody VisibilityRequest request) { service.visibility(hash,request); }
    @PostMapping("/live/ingest") public Map<String,Integer> ingestLive(@RequestHeader(value="X-Quest-Token",required=false) String token,
        @Valid @RequestBody LiveBatch batch) { return service.ingestLive(token,batch); }
    @DeleteMapping("/sessions/{id}") public void revoke(@PathVariable UUID id) { service.revoke(id); }
    @PostMapping("/ingest") public Map<String,Integer> ingest(@RequestHeader(value="X-Quest-Token",required=false) String token,
        @Valid @RequestBody Batch batch) { return service.ingest(token,batch); }
}
