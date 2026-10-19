package com.guild.app.discord;

import com.guild.app.discord.dto.DiscordMembersResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

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
}
