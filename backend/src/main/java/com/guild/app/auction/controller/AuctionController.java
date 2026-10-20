package com.guild.app.auction.controller;

import com.guild.app.auction.dto.*;
import com.guild.app.auction.service.AuctionService;
import com.guild.app.common.security.SecurityUtils;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/auctions")
@RequiredArgsConstructor
public class AuctionController {

    private final AuctionService auctionService;

    @GetMapping
    public List<AuctionResponse> list() {
        return auctionService.listOpen();
    }

    @GetMapping("/{id}")
    public AuctionResponse getById(@PathVariable Long id) {
        return auctionService.getById(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AuctionResponse create(@Valid @RequestBody CreateAuctionRequest request) {
        return auctionService.create(request, SecurityUtils.currentMember());
    }

    /** Líder/Administrador: force-close an active auction (no winner, reserves released). */
    @PostMapping("/{id}/cancel")
    public AuctionResponse cancel(@PathVariable Long id) {
        return auctionService.cancel(id, SecurityUtils.currentMember());
    }

    /** Líder/Administrador: add 5 minutes to an open auction (a DOLE countdown goes back to OPEN). */
    @PostMapping("/{id}/extend")
    public AuctionResponse extend(@PathVariable Long id) {
        return auctionService.extend(id, SecurityUtils.currentMember());
    }

    /** Líder/Administrador: delete a finished auction. Points are untouched. */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        auctionService.delete(id, SecurityUtils.currentMember());
    }

    @PostMapping("/{id}/bids")
    public AuctionResponse placeBid(@PathVariable Long id, @Valid @RequestBody PlaceBidRequest request) {
        return auctionService.placeBid(id, request, SecurityUtils.currentMember());
    }

    @GetMapping("/{id}/messages")
    public List<AuctionMessageResponse> messages(@PathVariable Long id) {
        return auctionService.getMessages(id);
    }

    /** Adds the emoji to the message, or removes it if the member already reacted with it. */
    @PostMapping("/{id}/messages/{messageId}/reactions")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void toggleReaction(@PathVariable Long id, @PathVariable Long messageId,
                               @Valid @RequestBody ToggleReactionRequest request) {
        auctionService.toggleReaction(id, messageId, request.emoji(), SecurityUtils.currentMember());
    }

    @PostMapping("/{id}/messages")
    @ResponseStatus(HttpStatus.CREATED)
    public void chat(@PathVariable Long id, @Valid @RequestBody ChatMessageRequest request) {
        auctionService.sendChatMessage(id, request, SecurityUtils.currentMember());
    }
}
