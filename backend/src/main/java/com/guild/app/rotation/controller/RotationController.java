package com.guild.app.rotation.controller;

import com.guild.app.rotation.dto.RotationDtos.*;
import com.guild.app.rotation.service.RotationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/rotation/bosses")
@RequiredArgsConstructor
public class RotationController {
    private final RotationService service;
    @GetMapping public Schedule read() { return service.read(); }
    @PutMapping @PreAuthorize("hasAnyRole('ADMINISTRADOR','LIDER')")
    public Schedule update(@Valid @RequestBody Update request) { return service.update(request); }
}
