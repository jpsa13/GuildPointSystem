package com.guild.app.equipment.controller;

import com.guild.app.equipment.dto.EquipmentDtos.*;
import com.guild.app.equipment.service.EquipmentService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
@RequestMapping("/api/equipment")
@RequiredArgsConstructor
public class EquipmentController {
    private final EquipmentService service;
    @GetMapping public List<MemberEquipment> board() { return service.board(); }
    @GetMapping("/members/{id}/relics") public List<Integer> relics(@PathVariable long id) { return service.relics(id); }
    @PutMapping("/members/{id}/relics/{relicId}")
    public List<Integer> setRelic(@PathVariable long id,@PathVariable int relicId,@Valid @RequestBody RelicState state) {
        return service.setRelic(id,relicId,state);
    }
    @GetMapping("/reviews") public List<ReviewStatus> reviews() { return service.reviews(); }
    @PostMapping("/reviews") public ReviewStatus requestReview(@Valid @RequestBody ReviewRequest request) { return service.requestReview(request); }
    @PostMapping("/reviews/{id}/confirm") public ReviewStatus confirmReview(@PathVariable UUID id) { return service.confirmReview(id); }
    @GetMapping("/members/{id}/history") public List<Assignment> history(@PathVariable long id) { return service.history(id); }
    @GetMapping("/catalog/status") public Map<String,Object> status() { return service.importStatus(); }
    @GetMapping("/catalog") public CatalogPage catalog(@RequestParam String category,
        @RequestParam(defaultValue="") String search,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="30") int size,
        @RequestParam(required=false) Integer level,@RequestParam(required=false) Integer grade,@RequestParam(required=false) String ability,
        @RequestParam(defaultValue="CORA") String race,@RequestParam(required=false) String equipmentClass,
        @RequestParam(required=false) String accessoryEffect,@RequestParam(required=false) Integer weaponType) {
        return service.catalog(category,search,page,size,level,grade,ability,race,equipmentClass,accessoryEffect,weaponType);
    }
    @PostMapping("/operations")
    public Assignment operate(@Valid @RequestBody Operation request) { return service.operate(request); }
    @PostMapping("/slots")
    public SlotEditResult editSlots(@Valid @RequestBody SlotEdit request) { return service.editSlots(request); }
    @PostMapping("/catalog/import")
    @PreAuthorize("hasAnyRole('ADMINISTRADOR','LIDER')")
    public Map<String,Object> importCatalog(@Valid @RequestBody ImportRequest request) { return service.importCatalog(request); }
}
