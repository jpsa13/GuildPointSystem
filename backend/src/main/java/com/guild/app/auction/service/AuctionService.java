package com.guild.app.auction.service;

import com.guild.app.auction.dto.*;
import com.guild.app.auction.entity.*;
import com.guild.app.auction.repository.*;
import com.guild.app.auth.security.MemberPrincipal;
import com.guild.app.common.enums.AuditLogType;
import com.guild.app.common.enums.AuctionStatus;
import com.guild.app.common.enums.MemberStatus;
import com.guild.app.common.enums.PointsModality;
import com.guild.app.common.enums.Role;
import com.guild.app.common.exception.AppException;
import com.guild.app.common.security.SecurityUtils;
import com.guild.app.item.dto.ItemResponse;
import com.guild.app.item.entity.GameLuaItem;
import com.guild.app.item.repository.GameLuaItemRepository;
import com.guild.app.item.repository.ItemRepository;
import com.guild.app.log.service.AuditLogService;
import com.guild.app.member.entity.Member;
import com.guild.app.member.repository.MemberRepository;
import com.guild.app.points.service.PointsService;
import com.guild.app.websocket.WebSocketPublisher;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class AuctionService {

    private static final Set<Integer> ALLOWED_DURATIONS = Set.of(1, 5, 15, 30, 60, 180, 360, 720, 1440);
    private static final int CLOSED_LIST_LIMIT = 50;

    /** A bid with this much time left (or less) resets the clock to {@link #EXTENDED_SECONDS}. */
    static final long EXTEND_THRESHOLD_MS = 15_000;
    static final long EXTENDED_SECONDS = 25;
    static final long DOLE_STEP_SECONDS = 2;
    static final long DOLE_RESCUE_SECONDS = 10;

    /** Tie-break timeline: announcement countdown → free spin → landing on the drawn winner. */
    static final long TIE_COUNTDOWN_SECONDS = 5;
    static final long TIE_SPIN_SECONDS = 6;
    static final long TIE_LANDING_SECONDS = 5;
    static final short TIE_PHASE_COUNTDOWN = 1;
    static final short TIE_PHASE_SPIN = 2;
    static final short TIE_PHASE_LANDING = 3;

    static final List<AuctionStatus> ACTIVE_STATUSES =
            List.of(AuctionStatus.OPEN, AuctionStatus.DOLE, AuctionStatus.TIE_BREAK);
    static final List<AuctionStatus> FINISHED_STATUSES =
            List.of(AuctionStatus.CLOSED, AuctionStatus.CANCELLED);

    private static final SecureRandom RANDOM = new SecureRandom();

    private final AuctionRepository auctionRepository;
    private final AuctionItemRepository auctionItemRepository;
    private final AuctionBidRepository auctionBidRepository;
    private final AuctionMessageRepository auctionMessageRepository;
    private final ItemRepository itemRepository;
    private final GameLuaItemRepository gameLuaItemRepository;
    private final MemberRepository memberRepository;
    private final PointsService pointsService;
    private final AuditLogService auditLogService;
    private final WebSocketPublisher webSocketPublisher;

    @Transactional(readOnly = true)
    public List<AuctionResponse> listOpen() {
        var active = auctionRepository.findByStatusInOrderByCreatedAtDesc(ACTIVE_STATUSES);
        var closed = auctionRepository.findByStatusInOrderByCreatedAtDesc(FINISHED_STATUSES).stream()
                .limit(CLOSED_LIST_LIMIT)
                .toList();

        var combined = new ArrayList<Auction>(active.size() + closed.size());
        combined.addAll(active);
        combined.addAll(closed);
        return combined.stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public AuctionResponse getById(Long id) {
        var auction = auctionRepository.findByIdWithWinner(id)
                .orElseThrow(() -> new AppException("Leilão não encontrado.", HttpStatus.NOT_FOUND));
        return toResponse(auction);
    }

    @Transactional
    public AuctionResponse create(CreateAuctionRequest request, MemberPrincipal actor) {
        SecurityUtils.requireRole(Role.ADMINISTRADOR);
        if (!ALLOWED_DURATIONS.contains(request.durationMinutes())) {
            throw new AppException("Duração inválida.", HttpStatus.BAD_REQUEST);
        }

        var auction = new Auction();
        auction.setDurationMinutes(request.durationMinutes());
        auction.setCreatedBy(memberRepository.getReferenceById(actor.getId()));
        auction.setEndsAt(Instant.now().plusSeconds(request.durationMinutes() * 60L));
        auction = auctionRepository.save(auction);

        for (var entry : request.items()) {
            var item = itemRepository.findById(entry.itemId())
                    .orElseThrow(() -> new AppException("Item não encontrado.", HttpStatus.NOT_FOUND));
            var ai = new AuctionItem();
            ai.setAuction(auction);
            ai.setItem(item);
            ai.setQuantity(entry.quantity());
            auctionItemRepository.save(ai);
        }

        auditLogService.log(AuditLogType.AUCTION_CREATED,
                memberRepository.getReferenceById(actor.getId()), null,
                Map.of("auctionId", auction.getId(), "durationMinutes", request.durationMinutes()));

        var response = toResponse(auction);
        // Global announcement: every connected client listens on /topic/auctions.
        webSocketPublisher.publishAuctionList(Map.of("type", "AUCTION_CREATED", "auction", response));
        publishAuctionUpdate(response);
        return response;
    }

    /**
     * Bids on one auction are serialized by the row lock, so among concurrent bids the first to
     * acquire it wins and every later one is validated against the already-updated current bid.
     */
    @Transactional
    public AuctionResponse placeBid(Long auctionId, long amount, Long actorId) {
        if (amount < 1) {
            throw new AppException("O lance deve ser de no mínimo 1 ponto.", HttpStatus.BAD_REQUEST);
        }
        var auction = auctionRepository.findByIdForUpdate(auctionId)
                .orElseThrow(() -> new AppException("Leilão não encontrado.", HttpStatus.NOT_FOUND));

        var now = Instant.now();
        if (auction.getStatus() != AuctionStatus.OPEN && auction.getStatus() != AuctionStatus.DOLE) {
            throw new AppException("Este leilão não está mais aceitando lances.", HttpStatus.CONFLICT);
        }
        if (auction.getStatus() == AuctionStatus.OPEN && !auction.getEndsAt().isAfter(now)) {
            throw new AppException("Tempo esgotado: o lance chegou depois do fim do leilão.", HttpStatus.CONFLICT);
        }

        // Member lock: prevents the same points from being committed in two auctions at once.
        var member = memberRepository.findByIdForUpdate(actorId)
                .orElseThrow(() -> new AppException("Membro não encontrado.", HttpStatus.NOT_FOUND));
        if (member.getStatus() != MemberStatus.APROVADO) {
            throw new AppException("Apenas membros aprovados podem dar lances.", HttpStatus.FORBIDDEN);
        }

        long currentBid = auction.getCurrentBid();
        var previousLeaders = currentBid > 0
                ? auctionBidRepository.findTiedMemberIds(auctionId, currentBid)
                : List.<Long>of();
        if (previousLeaders.contains(actorId)) {
            throw new AppException("Você já está com o maior lance (" + currentBid + ").", HttpStatus.CONFLICT);
        }

        long available = pointsService.getAvailablePoints(actorId, auctionId);
        if (amount > available) {
            throw new AppException("Saldo disponível insuficiente: você tem " + available + " pts.",
                    HttpStatus.BAD_REQUEST);
        }
        if (amount < currentBid) {
            throw new AppException("Lance recusado: o lance atual já é " + currentBid
                    + " (" + leaderLabel(previousLeaders) + "), maior que o seu " + amount + ".",
                    HttpStatus.CONFLICT);
        }
        if (amount == currentBid && amount != available) {
            throw new AppException("Lance recusado: o lance atual já é " + currentBid
                    + " (" + leaderLabel(previousLeaders) + "). Empatar só é permitido com all-in"
                    + " (todo o seu saldo disponível: " + available + " pts).",
                    HttpStatus.CONFLICT);
        }

        var bid = new AuctionBid();
        bid.setAuction(auction);
        bid.setMember(member);
        bid.setAmount(amount);
        auctionBidRepository.save(bid);

        auction.setCurrentBid(amount);
        if (auction.getStatus() == AuctionStatus.DOLE) {
            // Bid rescued the auction from DOLE — back to OPEN with +10s.
            auction.setEndsAt(now.plusSeconds(DOLE_RESCUE_SECONDS));
            auction.setStatus(AuctionStatus.OPEN);
            auction.setDolePhase(0);
        } else if (auction.getEndsAt().toEpochMilli() - now.toEpochMilli() <= EXTEND_THRESHOLD_MS) {
            auction.setEndsAt(now.plusSeconds(EXTENDED_SECONDS));
        }
        auction.bumpVersion();
        auctionRepository.save(auction);

        addBidMessage(auction, member, amount, amount == currentBid);
        var response = toResponse(auction);
        publishAuctionUpdate(response);
        publishPointsUpdate(actorId);
        // Outbid leaders get their reserve released (a tie keeps it reserved, but refresh anyway).
        previousLeaders.forEach(this::publishPointsUpdate);
        return response;
    }

    @Transactional
    public AuctionResponse placeBid(Long auctionId, PlaceBidRequest request, MemberPrincipal actor) {
        return placeBid(auctionId, request.amount(), actor.getId());
    }

    /**
     * Force-closes an active auction with no winner. Nobody is charged: points were only reserved
     * (available balance excludes active auctions), so moving out of an active status releases them.
     */
    @Transactional
    public AuctionResponse cancel(Long auctionId, MemberPrincipal actor) {
        SecurityUtils.requireRole(Role.ADMINISTRADOR);
        var auction = auctionRepository.findByIdForUpdate(auctionId)
                .orElseThrow(() -> new AppException("Leilão não encontrado.", HttpStatus.NOT_FOUND));
        if (!ACTIVE_STATUSES.contains(auction.getStatus())) {
            throw new AppException("Só é possível encerrar leilões em andamento.", HttpStatus.CONFLICT);
        }

        var reservedIds = auction.getCurrentBid() > 0
                ? auctionBidRepository.findTiedMemberIds(auctionId, auction.getCurrentBid())
                : List.<Long>of();
        var actorMember = memberRepository.getReferenceById(actor.getId());

        auction.setStatus(AuctionStatus.CANCELLED);
        auction.setWinner(null);
        auction.setDolePhase(0);
        auction.setTieBreakPhase((short) 0);
        auction.bumpVersion();
        auctionRepository.save(auction);

        auditLogService.log(AuditLogType.AUCTION_CANCELLED, actorMember, null, Map.of(
                "auctionId", auctionId,
                "amount", auction.getCurrentBid(),
                "releasedMemberIds", reservedIds));

        var response = toResponse(auction);
        var payload = new HashMap<String, Object>();
        payload.put("type", "AUCTION_CANCELLED");
        payload.put("auctionId", auctionId);
        payload.put("version", auction.getStateVersion());
        webSocketPublisher.publishAuction(auctionId, payload);
        publishAuctionUpdate(response);
        addBotMessage(auction, "Leilão encerrado pela administração. Ninguém foi cobrado"
                + (reservedIds.isEmpty() ? "." : " e os pontos reservados foram devolvidos."));
        // Released reserves show up in the members' available balance immediately.
        reservedIds.forEach(this::publishPointsUpdate);
        return response;
    }

    /** Deletes a finished auction with its bids and chat. Points are untouched (debits stay in history). */
    @Transactional
    public void delete(Long auctionId, MemberPrincipal actor) {
        SecurityUtils.requireRole(Role.ADMINISTRADOR);
        var auction = auctionRepository.findByIdForUpdate(auctionId)
                .orElseThrow(() -> new AppException("Leilão não encontrado.", HttpStatus.NOT_FOUND));
        if (!FINISHED_STATUSES.contains(auction.getStatus())) {
            throw new AppException("Encerre o leilão antes de excluí-lo.", HttpStatus.CONFLICT);
        }

        var itemNames = auctionItemRepository.findByAuctionIdWithItem(auctionId).stream()
                .map(ai -> ai.getItem().getName())
                .collect(Collectors.joining(", "));
        var payload = new HashMap<String, Object>();
        payload.put("auctionId", auctionId);
        payload.put("status", auction.getStatus().name());
        payload.put("items", itemNames);
        payload.put("amount", auction.getCurrentBid());
        payload.put("winnerId", auction.getWinner() != null ? auction.getWinner().getId() : "none");
        auditLogService.log(AuditLogType.AUCTION_DELETED, memberRepository.getReferenceById(actor.getId()), null, payload);

        // Bulk delete in the DB (cascades to bids, items, messages) — loaded children never block it.
        auctionRepository.deleteByIdCascade(auctionId);

        var event = Map.of("type", "AUCTION_DELETED", "auctionId", auctionId);
        webSocketPublisher.publishAuction(auctionId, event);
        webSocketPublisher.publishAuctionList(event);
    }

    @Transactional
    public void sendChatMessage(Long auctionId, ChatMessageRequest request, MemberPrincipal actor) {
        var auction = auctionRepository.findById(auctionId)
                .orElseThrow(() -> new AppException("Leilão não encontrado.", HttpStatus.NOT_FOUND));
        if (FINISHED_STATUSES.contains(auction.getStatus())) {
            throw new AppException("Este leilão já foi encerrado.", HttpStatus.BAD_REQUEST);
        }
        var msg = new AuctionMessage();
        msg.setAuction(auction);
        msg.setMember(memberRepository.getReferenceById(actor.getId()));
        msg.setType("TEXT");
        msg.setContent(request.content());
        msg = auctionMessageRepository.save(msg);
        webSocketPublisher.publishAuction(auctionId, Map.of(
                "type", "CHAT", "message", toMessageResponse(msg)));
    }

    @Transactional(readOnly = true)
    public List<AuctionMessageResponse> getMessages(Long auctionId) {
        return auctionMessageRepository.findByAuctionIdOrderByCreatedAtAsc(auctionId).stream()
                .map(this::toMessageResponse)
                .toList();
    }

    /** Active auctions where the member currently holds (or ties) the top bid. */
    @Transactional(readOnly = true)
    public List<Long> findActiveAuctionsLedBy(Long memberId) {
        return auctionRepository.findByStatusInOrderByCreatedAtDesc(ACTIVE_STATUSES).stream()
                .filter(a -> a.getCurrentBid() > 0)
                .filter(a -> auctionBidRepository.findTiedMemberIds(a.getId(), a.getCurrentBid()).contains(memberId))
                .map(Auction::getId)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<Long> findDueAuctionIds() {
        return auctionRepository.findDueIds(ACTIVE_STATUSES, Instant.now());
    }

    /** Advances one auction whose timer expired. Each call runs in its own transaction. */
    @Transactional
    public void advance(Long auctionId) {
        var auction = auctionRepository.findByIdForUpdate(auctionId).orElse(null);
        // Guards: a bid may have extended the timer, or another tick already advanced it.
        if (auction == null || auction.getEndsAt().isAfter(Instant.now())) return;

        switch (auction.getStatus()) {
            case OPEN -> startDole(auction);
            case DOLE -> advanceDole(auction);
            case TIE_BREAK -> advanceTieBreak(auction);
            default -> { }
        }
    }

    private void startDole(Auction auction) {
        if (auction.getCurrentBid() == 0) {
            closeWithWinner(auction, null);
            return;
        }
        auction.setStatus(AuctionStatus.DOLE);
        auction.setDolePhase(1);
        auction.setEndsAt(Instant.now().plusSeconds(DOLE_STEP_SECONDS));
        auction.bumpVersion();
        auctionRepository.save(auction);
        addBotMessage(auction, "DOLE 1");
        publishAuctionUpdate(toResponse(auction));
    }

    private void advanceDole(Auction auction) {
        int phase = auction.getDolePhase();
        if (phase >= 3) {
            resolveAuction(auction);
            return;
        }
        phase++;
        auction.setDolePhase(phase);
        auction.setEndsAt(Instant.now().plusSeconds(DOLE_STEP_SECONDS));
        auction.bumpVersion();
        auctionRepository.save(auction);
        addBotMessage(auction, "DOLE " + phase);
        publishAuctionUpdate(toResponse(auction));
    }

    private void resolveAuction(Auction auction) {
        var tiedIds = auctionBidRepository.findTiedMemberIds(auction.getId(), auction.getCurrentBid());
        if (tiedIds.size() <= 1) {
            closeWithWinner(auction, tiedIds.isEmpty() ? null : tiedIds.getFirst());
            return;
        }

        auction.setStatus(AuctionStatus.TIE_BREAK);
        auction.setDolePhase(0);
        auction.setTieBreakPhase(TIE_PHASE_COUNTDOWN);
        auction.setEndsAt(Instant.now().plusSeconds(TIE_COUNTDOWN_SECONDS));
        auction.bumpVersion();
        auctionRepository.save(auction);

        var tiedMembers = tiedMembers(tiedIds);
        var names = tiedMembers.stream().map(m -> (String) m.get("nickname")).collect(Collectors.joining(", "));
        addBotMessage(auction, "EMPATE em " + auction.getCurrentBid() + " pts entre " + names
                + ". O desempate será feito por roleta aleatória em " + TIE_COUNTDOWN_SECONDS + " segundos.");

        var response = toResponse(auction);
        webSocketPublisher.publishAuction(auction.getId(), Map.of(
                "type", "TIE_BREAK_START",
                "tiedMembers", tiedMembers,
                "countdownEndsAt", auction.getEndsAt(),
                "version", auction.getStateVersion()));
        publishAuctionUpdate(response);
    }

    private void advanceTieBreak(Auction auction) {
        switch (auction.getTieBreakPhase()) {
            case TIE_PHASE_COUNTDOWN -> {
                auction.setTieBreakPhase(TIE_PHASE_SPIN);
                auction.setEndsAt(Instant.now().plusSeconds(TIE_SPIN_SECONDS));
                auction.bumpVersion();
                auctionRepository.save(auction);
                webSocketPublisher.publishAuction(auction.getId(), Map.of(
                        "type", "TIE_BREAK_SPIN",
                        "version", auction.getStateVersion()));
                publishAuctionUpdate(toResponse(auction));
            }
            case TIE_PHASE_SPIN -> {
                // The winner is drawn only now, after the wheel has been spinning blind for a while.
                var tiedIds = auctionBidRepository.findTiedMemberIds(auction.getId(), auction.getCurrentBid());
                if (tiedIds.isEmpty()) {
                    closeWithWinner(auction, null);
                    return;
                }
                int winnerIndex = RANDOM.nextInt(tiedIds.size());
                auction.setWinner(memberRepository.getReferenceById(tiedIds.get(winnerIndex)));
                auction.setTieBreakPhase(TIE_PHASE_LANDING);
                auction.setEndsAt(Instant.now().plusSeconds(TIE_LANDING_SECONDS));
                auction.bumpVersion();
                auctionRepository.save(auction);
                // Only the wheel position is sent; the name is revealed by AUCTION_CLOSED.
                webSocketPublisher.publishAuction(auction.getId(), Map.of(
                        "type", "TIE_BREAK_RESULT",
                        "winnerIndex", winnerIndex,
                        "segmentCount", tiedIds.size(),
                        "landingMs", TIE_LANDING_SECONDS * 1000,
                        "version", auction.getStateVersion()));
                publishAuctionUpdate(toResponse(auction));
            }
            default -> closeWithWinner(auction,
                    auction.getWinner() != null ? auction.getWinner().getId() : null);
        }
    }

    private void closeWithWinner(Auction auction, Long winnerId) {
        auction.setStatus(AuctionStatus.CLOSED);
        auction.setTieBreakPhase((short) 0);
        auction.setDolePhase(0);
        auction.setWinner(winnerId != null ? memberRepository.getReferenceById(winnerId) : null);
        auction.bumpVersion();
        auctionRepository.save(auction);

        long charged = 0;
        String winnerNickname = null;
        if (winnerId != null) {
            var winner = memberRepository.findByIdForUpdate(winnerId).orElseThrow();
            winnerNickname = winner.getNickname();
            // Reserve rules make this the full bid; cap it so an admin correction can't wedge the scheduler.
            charged = Math.min(auction.getCurrentBid(), Math.max(0, winner.getPoints()));
            if (charged > 0) {
                pointsService.adjustPoints(winner, winner, -charged,
                        PointsModality.LEILAO, "Auction win #" + auction.getId());
            }
            publishPointsUpdate(winnerId);
        }

        auditLogService.log(AuditLogType.AUCTION_CLOSED, auction.getCreatedBy(), null, Map.of(
                "auctionId", auction.getId(),
                "winnerId", winnerId != null ? winnerId : "none",
                "amount", auction.getCurrentBid(),
                "charged", charged));

        var payload = new HashMap<String, Object>();
        payload.put("type", "AUCTION_CLOSED");
        payload.put("winnerId", winnerId);
        payload.put("winnerNickname", winnerNickname);
        payload.put("amount", auction.getCurrentBid());
        payload.put("version", auction.getStateVersion());
        webSocketPublisher.publishAuction(auction.getId(), payload);
        publishAuctionUpdate(toResponse(auction));
        // Chat announcement goes out after AUCTION_CLOSED so it never leads the roulette reveal.
        addBotMessage(auction, winnerNickname != null
                ? "Leilão encerrado! Vencedor: " + winnerNickname + " com " + auction.getCurrentBid() + " pts."
                : "Leilão encerrado sem lances.");
    }

    private void addBidMessage(Auction auction, Member member, long amount, boolean tie) {
        var msg = new AuctionMessage();
        msg.setAuction(auction);
        msg.setMember(member);
        msg.setType("BID");
        msg.setContent(member.getNickname() + (tie ? " EMPATOU (all-in) com " : " deu um lance de ") + amount + " pts");
        msg = auctionMessageRepository.save(msg);
        webSocketPublisher.publishAuction(auction.getId(),
                Map.of("type", "BID", "message", toMessageResponse(msg)));
    }

    private void addBotMessage(Auction auction, String text) {
        var msg = new AuctionMessage();
        msg.setAuction(auction);
        msg.setType("BOT");
        msg.setContent(text);
        msg = auctionMessageRepository.save(msg);
        webSocketPublisher.publishAuction(auction.getId(),
                Map.of("type", "BOT", "message", toMessageResponse(msg)));
    }

    private String leaderLabel(List<Long> leaderIds) {
        if (leaderIds.isEmpty()) return "sem líder";
        var names = memberRepository.findAllById(leaderIds).stream()
                .collect(Collectors.toMap(Member::getId, Member::getNickname));
        return leaderIds.stream().map(id -> names.getOrDefault(id, "?")).collect(Collectors.joining(", "));
    }

    private List<Map<String, Object>> tiedMembers(List<Long> tiedIds) {
        var names = memberRepository.findAllById(tiedIds).stream()
                .collect(Collectors.toMap(Member::getId, Member::getNickname));
        return tiedIds.stream()
                .map(id -> Map.<String, Object>of("id", id, "nickname", names.getOrDefault(id, "?")))
                .toList();
    }

    private void publishAuctionUpdate(AuctionResponse response) {
        var payload = Map.of("type", "AUCTION_UPDATE", "auction", response);
        webSocketPublisher.publishAuction(response.id(), payload);
        webSocketPublisher.publishAuctionList(payload);
    }

    private void publishPointsUpdate(Long memberId) {
        webSocketPublisher.publishPointsUpdate(memberId, () -> Map.of(
                "memberId", memberId,
                "availablePoints", pointsService.getAvailablePoints(memberId)));
    }

    private AuctionResponse toResponse(Auction auction) {
        var auctionItems = auctionItemRepository.findByAuctionIdWithItem(auction.getId());
        var gameCodes = auctionItems.stream()
                .map(ai -> ai.getItem().getGameCode())
                .filter(code -> code != null && !code.isBlank())
                .toList();
        var luaByCode = gameCodes.isEmpty()
                ? Map.<String, GameLuaItem>of()
                : gameLuaItemRepository.findByGameCodeIn(gameCodes).stream()
                        .collect(Collectors.toMap(GameLuaItem::getGameCode, l -> l, (a, b) -> a));
        var items = auctionItems.stream()
                .map(ai -> {
                    var lua = ai.getItem().getGameCode() != null ? luaByCode.get(ai.getItem().getGameCode()) : null;
                    return new AuctionResponse.AuctionItemResponse(
                            ai.getItem().getId(),
                            ai.getItem().getName(),
                            ai.getItem().getImageUrl(),
                            ai.getQuantity(),
                            lua == null ? null : new ItemResponse.GameIcon(
                                    lua.getCategory(), lua.getGameIndex(), lua.getGameCode(),
                                    lua.getIconId(), lua.getSpriteSheet(), lua.getSpriteCols()));
                })
                .toList();

        var tiedIds = auction.getCurrentBid() > 0
                ? auctionBidRepository.findTiedMemberIds(auction.getId(), auction.getCurrentBid())
                : List.<Long>of();
        boolean tied = tiedIds.size() > 1;

        List<String> tiedMemberNicknames = List.of();
        Long leaderId = null;
        String leaderNickname = null;
        if (tied) {
            tiedMemberNicknames = tiedMembers(tiedIds).stream().map(m -> (String) m.get("nickname")).toList();
        } else if (!tiedIds.isEmpty()) {
            var topBid = auctionBidRepository.findFirstByAuctionIdOrderByAmountDescIdAsc(auction.getId());
            leaderId = topBid.map(b -> b.getMember().getId()).orElse(null);
            leaderNickname = topBid.map(b -> b.getMember().getNickname()).orElse(null);
        }

        boolean closed = auction.getStatus() == AuctionStatus.CLOSED;
        var winner = closed ? auction.getWinner() : null;

        return new AuctionResponse(
                auction.getId(),
                auction.getStatus(),
                auction.getDurationMinutes(),
                auction.getCreatedAt(),
                auction.getEndsAt(),
                auction.getCurrentBid(),
                winner != null ? winner.getId() : null,
                winner != null ? winner.getNickname() : null,
                leaderId,
                leaderNickname,
                tiedIds.size(),
                tied,
                tiedIds,
                tiedMemberNicknames,
                items,
                auction.getDolePhase(),
                auction.getTieBreakPhase(),
                auction.getStateVersion(),
                Instant.now());
    }

    private AuctionMessageResponse toMessageResponse(AuctionMessage msg) {
        var member = msg.getMember();
        return new AuctionMessageResponse(
                msg.getId(),
                msg.getType(),
                msg.getContent(),
                msg.getImageUrl(),
                msg.getCreatedAt(),
                member != null
                        ? new AuctionMessageResponse.MemberSummary(member.getId(), member.getNickname())
                        : null);
    }
}
