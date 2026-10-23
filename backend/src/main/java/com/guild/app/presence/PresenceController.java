package com.guild.app.presence;

import com.guild.app.common.enums.Role;
import com.guild.app.common.security.SecurityUtils;
import com.guild.app.presence.dto.AuctionViewer;
import com.guild.app.presence.dto.PresenceSnapshot;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Initial state of the "Online agora" panel; later changes arrive on {@code /topic/presence}. */
@RestController
@RequestMapping("/api/presence")
@RequiredArgsConstructor
public class PresenceController {

    private final PresenceRegistry presenceRegistry;

    @GetMapping
    public PresenceSnapshot online() {
        SecurityUtils.requireRole(Role.ADMINISTRADOR);
        return presenceRegistry.snapshot();
    }

    /** Any member: who has this auction open; later changes arrive on {@code /topic/auctions/{id}/viewers}. */
    @GetMapping("/auctions/{auctionId}")
    public List<AuctionViewer> auctionViewers(@PathVariable long auctionId) {
        return presenceRegistry.auctionViewers(auctionId);
    }
}
