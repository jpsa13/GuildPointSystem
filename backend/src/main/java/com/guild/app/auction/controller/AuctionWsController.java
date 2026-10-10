package com.guild.app.auction.controller;

import com.guild.app.auction.dto.BidResult;
import com.guild.app.auction.dto.WsBidRequest;
import com.guild.app.auction.service.AuctionService;
import com.guild.app.auth.security.MemberPrincipal;
import com.guild.app.common.exception.AppException;
import com.guild.app.websocket.WebSocketPublisher;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Controller;

import java.security.Principal;

/**
 * Bids over STOMP: client SENDs to {@code /app/auctions/{id}/bid} and gets the outcome on
 * {@code /user/queue/auction-bids}. Everyone else sees the result via {@code /topic/auctions/{id}}.
 */
@Slf4j
@Controller
@RequiredArgsConstructor
public class AuctionWsController {

    static final String BID_REPLY_QUEUE = "/queue/auction-bids";

    private final AuctionService auctionService;
    private final WebSocketPublisher webSocketPublisher;

    @MessageMapping("/auctions/{auctionId}/bid")
    public void bid(@DestinationVariable Long auctionId, @Payload WsBidRequest request, Principal principal) {
        if (!(principal instanceof Authentication auth) || !(auth.getPrincipal() instanceof MemberPrincipal member)) {
            return;
        }
        long amount = request.amount() != null ? request.amount() : 0;
        BidResult result;
        try {
            var auction = auctionService.placeBid(auctionId, amount, member.getId());
            result = new BidResult(request.requestId(), auctionId, amount, true, null, auction);
        } catch (AppException e) {
            result = new BidResult(request.requestId(), auctionId, amount, false, e.getMessage(), currentState(auctionId));
        } catch (Exception e) {
            log.error("WS bid failed (auction {}, member {})", auctionId, member.getId(), e);
            result = new BidResult(request.requestId(), auctionId, amount, false,
                    "Erro ao processar o lance. Tente novamente.", currentState(auctionId));
        }
        webSocketPublisher.publishToUser(principal.getName(), BID_REPLY_QUEUE, result);
    }

    private com.guild.app.auction.dto.AuctionResponse currentState(Long auctionId) {
        try {
            return auctionService.getById(auctionId);
        } catch (Exception e) {
            return null;
        }
    }
}
