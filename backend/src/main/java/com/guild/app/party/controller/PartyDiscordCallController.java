package com.guild.app.party.controller;

import com.guild.app.common.security.SecurityUtils;
import com.guild.app.party.service.PartyDiscordCallService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/parties") @RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class PartyDiscordCallController {
    private final PartyDiscordCallService service;
    @GetMapping("/discord-calls")
    public PartyDiscordCallService.Board board() {return service.board(SecurityUtils.currentMember());}
    @PostMapping("/{id}/discord-call")
    public PartyDiscordCallService.CallView start(@PathVariable Long id) {return service.start(id,SecurityUtils.currentMember());}
}
