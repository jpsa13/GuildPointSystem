package com.guild.app.auction.controller;

import com.guild.app.auction.dto.BidResult;
import com.guild.app.auction.dto.WsBidRequest;
import com.guild.app.auction.service.AuctionService;
import com.guild.app.auth.security.MemberPrincipal;
import com.guild.app.common.exception.AppException;
import com.guild.app.websocket.WebSocketPublisher;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
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
    /** Bid handling as the bidder feels it: lock wait, validation, commit and the WS fan-out. */
    static final String BID_TIMER = "guild.auction.bid";

    private final AuctionService auctionService;
    private final WebSocketPublisher webSocketPublisher;
    private final MeterRegistry meterRegistry;

    @MessageMapping("/auctions/{auctionId}/bid")
    public void bid(@DestinationVariable Long auctionId, @Payload WsBidRequest request, Principal principal) {
        if (!(principal instanceof Authentication auth) || !(auth.getPrincipal() instanceof MemberPrincipal member)) {
            return;
        }
        long amount = request.amount() != null ? request.amount() : 0;
        var sample = Timer.start(meterRegistry);
        String outcome = "accepted";
        BidResult result;
        try {
            var auction = auctionService.placeBid(auctionId, amount, member.getId());
            result = new BidResult(request.requestId(), auctionId, amount, true, null, auction);
            log.info("Bid of {} on auction {} accepted", amount, auctionId);
        } catch (AppException e) {
            outcome = "rejected";
            log.info("Bid of {} on auction {} rejected: {}", amount, auctionId, e.getMessage());
            result = new BidResult(request.requestId(), auctionId, amount, false, e.getMessage(), currentState(auctionId));
        } catch (Exception e) {
            outcome = "error";
            log.error("WS bid failed (auction {}, member {})", auctionId, member.getId(), e);
            result = new BidResult(request.requestId(), auctionId, amount, false,
                    "Erro ao processar o lance. Tente novamente.", currentState(auctionId));
        }
        webSocketPublisher.publishToUser(principal.getName(), BID_REPLY_QUEUE, result);
        sample.stop(meterRegistry.timer(BID_TIMER, "outcome", outcome));
    }

    private com.guild.app.auction.dto.AuctionResponse currentState(Long auctionId) {
        try {
            return auctionService.getById(auctionId);
        } catch (Exception e) {
            return null;
        }
    }
}
