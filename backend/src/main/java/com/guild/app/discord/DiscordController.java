package com.guild.app.discord;

import com.guild.app.common.enums.Role;
import com.guild.app.common.security.SecurityUtils;
import com.guild.app.discord.dto.DiscordMemberEntry;
import com.guild.app.discord.dto.DiscordMembersResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/discord")
@RequiredArgsConstructor
public class DiscordController {

    private final DiscordMemberService discordMemberService;

    /** Live snapshot; updates are pushed on /topic/discord/members. */
    @GetMapping("/members")
    public DiscordMembersResponse members() {
        return discordMemberService.snapshot();
    }

    /** Líder/Administrador: members hidden from the list. */
    @GetMapping("/hidden")
    public List<DiscordMemberEntry> hidden() {
        SecurityUtils.requireRole(Role.ADMINISTRADOR);
        return discordMemberService.hiddenSnapshot();
    }

    @PutMapping("/hidden/{discordId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void hide(@PathVariable String discordId) {
        SecurityUtils.requireRole(Role.ADMINISTRADOR);
        discordMemberService.setHidden(discordId, true, SecurityUtils.currentMember().getId());
    }

    @DeleteMapping("/hidden/{discordId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void show(@PathVariable String discordId) {
        SecurityUtils.requireRole(Role.ADMINISTRADOR);
        discordMemberService.setHidden(discordId, false, SecurityUtils.currentMember().getId());
    }
}
