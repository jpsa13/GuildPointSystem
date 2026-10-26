package com.guild.app.party.service;

import com.guild.app.auth.security.MemberPrincipal;
import com.guild.app.common.enums.MemberStatus;
import com.guild.app.common.enums.PartyMap;
import com.guild.app.common.enums.Role;
import com.guild.app.common.enums.PartyPendingKind;
import com.guild.app.common.enums.PartyPendingStatus;
import com.guild.app.common.exception.AppException;
import com.guild.app.characterstatus.entity.CharacterStatus;
import com.guild.app.characterstatus.repository.CharacterStatusRepository;
import com.guild.app.member.entity.Member;
import com.guild.app.member.repository.MemberRepository;
import com.guild.app.party.dto.*;
import com.guild.app.party.entity.*;
import com.guild.app.party.repository.*;
import com.guild.app.websocket.WebSocketPublisher;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class PartyService {

    private final PartyRepository partyRepository;
    private final PartyMemberRepository partyMemberRepository;
    private final PartyPendingRepository partyPendingRepository;
    private final PartyLfgRepository partyLfgRepository;
    private final MemberRepository memberRepository;
    private final CharacterStatusRepository characterStatusRepository;
    private final WebSocketPublisher webSocketPublisher;
    private final PartyBoardBroadcaster partyBoardBroadcaster;

    @Transactional(readOnly = true)
    public PartyBoardResponse getBoard(MemberPrincipal actor) {
        var member = requireApproved(actor);
        var board = loadPublicBoard();
        var my = buildMyState(member, board.memberLookup(), board.displayNumbers());
        return new PartyBoardResponse(board.parties(), board.lfg(), my, board.serverTime());
    }

    /** Board without personal state, broadcast to every client by {@link PartyBoardBroadcaster}. */
    @Transactional(readOnly = true)
    public PartyBoardSnapshot getPublicSnapshot() {
        var board = loadPublicBoard();
        return new PartyBoardSnapshot(board.parties(), board.lfg(), board.serverTime());
    }

    private record PublicBoard(
            List<PartySummary> parties,
            List<PartyLfgEntry> lfg,
            Map<Long, Member> memberLookup,
            Map<Long, Integer> displayNumbers,
            Instant serverTime) {}

    private PublicBoard loadPublicBoard() {
        var parties = partyRepository.findAllByOrderByMapAscCreatedAtAsc();
        var displayNumbers = computeDisplayNumbers(parties);
        var partyIds = parties.stream().map(Party::getId).toList();

        Map<Long, List<PartyMember>> membersByParty = new HashMap<>();
        Set<Long> memberIds = new HashSet<>();

        if (!partyIds.isEmpty()) {
            var partyMembers = partyMemberRepository.findByPartyIdInWithMember(partyIds);
            partyMembers.forEach(pm -> {
                membersByParty.computeIfAbsent(pm.getPartyId(), k -> new ArrayList<>()).add(pm);
                memberIds.add(pm.getMemberId());
            });
            membersByParty.values().forEach(list ->
                    list.sort(Comparator.comparing(PartyMember::getJoinedAt)));
        }

        var lfgRows = partyLfgRepository.findAllByOrderByCreatedAtAsc();
        lfgRows.forEach(l -> memberIds.add(l.getMemberId()));

        final Map<Long, Member> memberLookup = memberIds.isEmpty()
                ? Map.of()
                : memberRepository.findAllByIdInWithClass(memberIds).stream()
                        .collect(Collectors.toMap(Member::getId, Function.identity()));

        var partySummaries = parties.stream()
                .map(p -> toPartySummary(
                        p,
                        membersByParty.getOrDefault(p.getId(), List.of()),
                        memberLookup,
                        displayNumbers.getOrDefault(p.getId(), 1)))
                .toList();

        var lfg = lfgRows.stream()
                .map(row -> toLfgEntry(row, memberLookup))
                .toList();

        return new PublicBoard(partySummaries, lfg, memberLookup, displayNumbers, Instant.now());
    }

    @Transactional
    public PartyBoardResponse createParty(CreatePartyRequest request, MemberPrincipal actor) {
        var member = requireApproved(actor);
        ensureNotInParty(member.getId());

        var party = new Party();
        applyMapAndSpot(party, request.map(), request.spot());
        party.setLeader(member);
        party = partyRepository.save(party);

        addMemberRow(party.getId(), member.getId());
        partyLfgRepository.findByMemberId(member.getId()).ifPresent(partyLfgRepository::delete);

        publishBoard();
        return getBoard(actor);
    }

    @Transactional
    public PartyBoardResponse createPartyForMember(CreatePartyForMemberRequest request, MemberPrincipal actor) {
        var organizer = requireApproved(actor);
        if (!canOrganizeParties(organizer)) {
            throw new AppException(
                    "Apenas líder ou administradores podem formar PT para outros membros",
                    HttpStatus.FORBIDDEN);
        }

        var leader = memberRepository.findById(request.leaderMemberId())
                .orElseThrow(() -> new AppException("Membro não encontrado", HttpStatus.NOT_FOUND));
        if (leader.getStatus() != MemberStatus.APROVADO) {
            throw new AppException("Membro não disponível", HttpStatus.BAD_REQUEST);
        }
        ensureNotInParty(leader.getId());

        var party = new Party();
        party.setMap(request.map());
        party.setLeader(leader);
        party = partyRepository.save(party);

        addMemberRow(party.getId(), leader.getId());
        partyLfgRepository.findByMemberId(leader.getId()).ifPresent(partyLfgRepository::delete);

        publishBoard();
        return getBoard(actor);
    }

    @Transactional
    public PartyBoardResponse createEmptyParty(CreatePartyRequest request, MemberPrincipal actor) {
        var organizer = requireApproved(actor);
        if (!canOrganizeParties(organizer)) {
            throw new AppException(
                    "Apenas líder ou administradores podem criar PT vazia",
                    HttpStatus.FORBIDDEN);
        }

        var party = new Party();
        applyMapAndSpot(party, request.map(), request.spot());
        party.setLeader(null);
        partyRepository.save(party);

        publishBoard();
        return getBoard(actor);
    }

    @Transactional
    public PartyBoardResponse moveMember(Long toPartyId, MovePartyMemberRequest request, MemberPrincipal actor) {
        var actorMember = requireApproved(actor);
        // Lock both PTs in id order: two opposite moves (A→B and B→A) would otherwise deadlock.
        Long fromId = request.fromPartyId();
        if (fromId != null && !fromId.equals(toPartyId) && fromId < toPartyId) {
            partyRepository.findByIdForUpdate(fromId);
        }
        var toParty = partyRepository.findByIdForUpdate(toPartyId)
                .orElseThrow(() -> new AppException("PT não encontrada", HttpStatus.NOT_FOUND));
        if (!canManageParty(toParty, actorMember)) {
            throw new AppException("Sem permissão para adicionar membros nesta PT", HttpStatus.FORBIDDEN);
        }
        if (partyMemberRepository.countByPartyId(toPartyId) >= Party.MAX_MEMBERS) {
            throw new AppException("PT cheia", HttpStatus.BAD_REQUEST);
        }

        var target = memberRepository.findById(request.memberId())
                .orElseThrow(() -> new AppException("Membro não encontrado", HttpStatus.NOT_FOUND));
        if (target.getStatus() != MemberStatus.APROVADO) {
            throw new AppException("Membro não disponível", HttpStatus.BAD_REQUEST);
        }

        Long fromPartyId = request.fromPartyId();
        if (fromPartyId != null) {
            if (fromPartyId.equals(toPartyId)) {
                throw new AppException("Membro já está nesta PT", HttpStatus.BAD_REQUEST);
            }
            var fromParty = partyRepository.findByIdForUpdate(fromPartyId)
                    .orElseThrow(() -> new AppException("PT de origem não encontrada", HttpStatus.NOT_FOUND));
            if (fromParty.getMap() != toParty.getMap()) {
                throw new AppException("PTs em mapas diferentes", HttpStatus.BAD_REQUEST);
            }
            if (!canOrganizeParties(actorMember) && !canManageParty(fromParty, actorMember)) {
                throw new AppException("Sem permissão para mover desta PT", HttpStatus.FORBIDDEN);
            }
            boolean inFrom = partyMemberRepository.findByMemberId(target.getId())
                    .map(pm -> pm.getPartyId().equals(fromPartyId))
                    .orElse(false);
            if (!inFrom) {
                throw new AppException("Membro não está na PT de origem", HttpStatus.BAD_REQUEST);
            }
            removeMemberFromParty(fromParty, target.getId(), false);
        } else {
            if (partyMemberRepository.findByMemberId(target.getId()).isPresent()) {
                throw new AppException("Membro já está em uma PT", HttpStatus.BAD_REQUEST);
            }
            if (partyLfgRepository.findByMemberId(target.getId()).isEmpty()) {
                throw new AppException("Membro não está na lista de espera", HttpStatus.BAD_REQUEST);
            }
        }

        addMemberLocked(toParty, target);
        cancelOtherPendingForMember(target.getId());
        rejectRemainingJoinRequestsIfFull(toParty.getId());
        publishBoard();
        return getBoard(actor);
    }

    @Transactional
    public PartyBoardResponse assembleParty(AssemblePartyRequest request, MemberPrincipal actor) {
        var organizer = requireApproved(actor);
        if (!canOrganizeParties(organizer)) {
            throw new AppException(
                    "Apenas líder ou administradores podem montar PT pela lista de espera",
                    HttpStatus.FORBIDDEN);
        }
        if (!request.memberIds().contains(request.leaderMemberId())) {
            throw new AppException("O líder deve estar entre os membros selecionados", HttpStatus.BAD_REQUEST);
        }
        if (request.memberIds().size() > Party.MAX_MEMBERS) {
            throw new AppException("PT permite no máximo " + Party.MAX_MEMBERS + " membros", HttpStatus.BAD_REQUEST);
        }

        var uniqueIds = new LinkedHashSet<>(request.memberIds());
        if (uniqueIds.size() != request.memberIds().size()) {
            throw new AppException("Membros duplicados na seleção", HttpStatus.BAD_REQUEST);
        }

        List<Member> members = new ArrayList<>();
        for (Long memberId : request.memberIds()) {
            var member = memberRepository.findById(memberId)
                    .orElseThrow(() -> new AppException("Membro não encontrado", HttpStatus.NOT_FOUND));
            if (member.getStatus() != MemberStatus.APROVADO) {
                throw new AppException("Membro não disponível: " + member.getNickname(), HttpStatus.BAD_REQUEST);
            }
            ensureNotInParty(member.getId());
            members.add(member);
        }

        Member leader = members.stream()
                .filter(m -> m.getId().equals(request.leaderMemberId()))
                .findFirst()
                .orElseThrow(() -> new AppException("Líder inválido", HttpStatus.BAD_REQUEST));

        var party = new Party();
        party.setMap(request.map());
        party.setLeader(leader);
        party = partyRepository.save(party);

        for (Member member : members) {
            addMemberRow(party.getId(), member.getId());
            partyLfgRepository.findByMemberId(member.getId()).ifPresent(partyLfgRepository::delete);
        }

        publishBoard();
        return getBoard(actor);
    }

    @Transactional
    public PartyBoardResponse disband(Long partyId, MemberPrincipal actor) {
        var member = requireApproved(actor);
        var party = partyRepository.findByIdForUpdate(partyId)
                .orElseThrow(() -> new AppException("PT não encontrada", HttpStatus.NOT_FOUND));
        if (!canManageParty(party, member)) {
            throw new AppException("Sem permissão para dissolver esta PT", HttpStatus.FORBIDDEN);
        }

        Long dissolvedPartyId = party.getId();
        PartyMap dissolvedMap = party.getMap();
        var memberIds = partyMemberRepository.findByPartyIdOrderByJoinedAtAsc(partyId).stream()
                .map(PartyMember::getMemberId)
                .toList();

        partyPendingRepository.findByPartyIdAndStatus(partyId, PartyPendingStatus.PENDING).forEach(p -> {
            p.setStatus(PartyPendingStatus.CANCELLED);
            savePending(p);
        });

        for (Long memberId : memberIds) {
            partyMemberRepository.deleteByPartyIdAndMemberId(partyId, memberId);
        }
        partyRepository.delete(party);

        for (Long memberId : memberIds) {
            upsertLfgForMember(memberId, null);
            publishReturnedToLfgNotice(
                    memberId,
                    "A PT foi dissolvida. Você entrou na lista de espera global.",
                    dissolvedPartyId,
                    dissolvedMap);
        }

        publishBoard();
        return getBoard(actor);
    }

    @Transactional
    public PartyBoardResponse leave(Long partyId, MemberPrincipal actor) {
        var member = requireApproved(actor);
        // Lock: the last member leaving deletes the PT — must not interleave with someone being added.
        var party = partyRepository.findByIdForUpdate(partyId)
                .orElseThrow(() -> new AppException("PT não encontrada", HttpStatus.NOT_FOUND));
        if (!partyMemberRepository.findByMemberId(member.getId())
                .map(pm -> pm.getPartyId().equals(partyId))
                .orElse(false)) {
            throw new AppException("Você não está nesta PT", HttpStatus.BAD_REQUEST);
        }

        removeMemberFromParty(party, member.getId(), false);
        upsertLfgForMember(member.getId(), null);
        publishBoard();
        return getBoard(actor);
    }

    /**
     * Account deletion: drops the member from their PT (passing leadership / dissolving an emptied PT),
     * the LFG list and any pending invite or join request.
     */
    @Transactional
    public void removeMemberEverywhere(Long memberId) {
        partyMemberRepository.findByMemberId(memberId).ifPresent(pm ->
                partyRepository.findByIdForUpdate(pm.getPartyId())
                        .ifPresent(party -> removeMemberFromParty(party, memberId, false)));
        partyLfgRepository.findByMemberId(memberId).ifPresent(partyLfgRepository::delete);
        partyPendingRepository.findActiveForMember(memberId, PartyPendingStatus.PENDING).forEach(p -> {
            p.setStatus(PartyPendingStatus.CANCELLED);
            savePending(p);
        });
        publishBoard();
    }

    @Transactional
    public PartyBoardResponse kickMember(Long partyId, KickMemberRequest request, MemberPrincipal actor) {
        var actorMember = requireApproved(actor);
        var party = partyRepository.findByIdForUpdate(partyId)
                .orElseThrow(() -> new AppException("PT não encontrada", HttpStatus.NOT_FOUND));
        if (!canManageParty(party, actorMember)) {
            throw new AppException("Sem permissão para remover membros desta PT", HttpStatus.FORBIDDEN);
        }

        Long targetId = request.memberId();
        if (party.getLeader() != null && targetId.equals(party.getLeader().getId())) {
            throw new AppException("Transfira a liderança antes de remover o líder", HttpStatus.BAD_REQUEST);
        }
        boolean inParty = partyMemberRepository.findByMemberId(targetId)
                .map(pm -> pm.getPartyId().equals(partyId))
                .orElse(false);
        if (!inParty) {
            throw new AppException("Membro não está nesta PT", HttpStatus.BAD_REQUEST);
        }

        removeMemberFromParty(party, targetId, true);
        publishBoard();
        return getBoard(actor);
    }

    @Transactional
    public PartyBoardResponse transferLeader(
            Long partyId, TransferPartyLeaderRequest request, MemberPrincipal actor) {
        var actorMember = requireApproved(actor);
        var party = partyRepository.findByIdForUpdate(partyId)
                .orElseThrow(() -> new AppException("PT não encontrada", HttpStatus.NOT_FOUND));
        if (!canManageParty(party, actorMember)) {
            throw new AppException("Sem permissão para alterar o líder desta PT", HttpStatus.FORBIDDEN);
        }

        var newLeader = memberRepository.findById(request.memberId())
                .orElseThrow(() -> new AppException("Membro não encontrado", HttpStatus.NOT_FOUND));
        boolean inParty = partyMemberRepository.findByMemberId(newLeader.getId())
                .map(pm -> pm.getPartyId().equals(partyId))
                .orElse(false);
        if (!inParty) {
            throw new AppException("O novo líder precisa estar na PT", HttpStatus.BAD_REQUEST);
        }
        if (party.getLeader() != null && newLeader.getId().equals(party.getLeader().getId())) {
            throw new AppException("Este membro já é o líder", HttpStatus.BAD_REQUEST);
        }

        party.setLeader(newLeader);
        partyRepository.save(party);
        publishBoard();
        return getBoard(actor);
    }

    @Transactional
    public PartyBoardResponse addMemberDirect(Long partyId, AddPartyMemberRequest request, MemberPrincipal actor) {
        var actorMember = requireApproved(actor);
        var party = partyRepository.findByIdForUpdate(partyId)
                .orElseThrow(() -> new AppException("PT não encontrada", HttpStatus.NOT_FOUND));
        if (!canManageParty(party, actorMember)) {
            throw new AppException("Sem permissão para adicionar membros nesta PT", HttpStatus.FORBIDDEN);
        }

        var target = memberRepository.findById(request.memberId())
                .orElseThrow(() -> new AppException("Membro não encontrado", HttpStatus.NOT_FOUND));
        if (target.getStatus() != MemberStatus.APROVADO) {
            throw new AppException("Membro não disponível", HttpStatus.BAD_REQUEST);
        }

        addMemberLocked(party, target);
        cancelOtherPendingForMember(target.getId());
        rejectRemainingJoinRequestsIfFull(party.getId());

        publishBoard();
        return getBoard(actor);
    }

    @Transactional
    public PartyBoardResponse requestJoin(Long partyId, MemberPrincipal actor) {
        var member = requireApproved(actor);
        ensureNotInParty(member.getId());

        // Lock like every other write to the PT: otherwise a request racing the last slot being filled
        // passes the count check and stays pending on a full PT.
        var party = partyRepository.findByIdForUpdate(partyId)
                .orElseThrow(() -> new AppException("PT não encontrada", HttpStatus.NOT_FOUND));
        if (party.getLeader() == null) {
            throw new AppException("Esta PT ainda não tem líder — arraste um membro para ela", HttpStatus.BAD_REQUEST);
        }
        if (partyMemberRepository.countByPartyId(partyId) >= Party.MAX_MEMBERS) {
            throw new AppException("PT cheia", HttpStatus.BAD_REQUEST);
        }

        partyPendingRepository.findByPartyIdAndInitiatorIdAndKindAndStatus(
                partyId, member.getId(), PartyPendingKind.JOIN_REQUEST, PartyPendingStatus.PENDING
        ).ifPresent(p -> {
            throw new AppException("Você já tem um pedido pendente para esta PT", HttpStatus.CONFLICT);
        });

        var pending = new PartyPending();
        pending.setParty(party);
        pending.setKind(PartyPendingKind.JOIN_REQUEST);
        pending.setInitiator(member);
        pending.setTarget(party.getLeader());
        pending.setStatus(PartyPendingStatus.PENDING);
        savePending(pending);

        publishBoard();
        return getBoard(actor);
    }

    @Transactional
    public PartyBoardResponse invite(Long partyId, InviteMemberRequest request, MemberPrincipal actor) {
        var member = requireApproved(actor);
        var party = partyRepository.findByIdForUpdate(partyId)
                .orElseThrow(() -> new AppException("PT não encontrada", HttpStatus.NOT_FOUND));
        if (!canManageParty(party, member)) {
            throw new AppException("Sem permissão para convidar nesta PT", HttpStatus.FORBIDDEN);
        }
        if (partyMemberRepository.countByPartyId(partyId) >= Party.MAX_MEMBERS) {
            throw new AppException("PT cheia", HttpStatus.BAD_REQUEST);
        }

        var target = memberRepository.findById(request.memberId())
                .orElseThrow(() -> new AppException("Membro não encontrado", HttpStatus.NOT_FOUND));
        if (target.getStatus() != MemberStatus.APROVADO) {
            throw new AppException("Membro não disponível", HttpStatus.BAD_REQUEST);
        }
        if (partyMemberRepository.findByMemberId(target.getId()).isPresent()) {
            throw new AppException("Membro já está em uma PT", HttpStatus.BAD_REQUEST);
        }
        if (target.getId().equals(member.getId())) {
            throw new AppException("Não é possível convidar a si mesmo", HttpStatus.BAD_REQUEST);
        }

        partyPendingRepository.findByPartyIdAndTargetIdAndStatus(
                partyId, target.getId(), PartyPendingStatus.PENDING
        ).ifPresent(p -> {
            throw new AppException("Já existe convite ou pedido pendente para este membro", HttpStatus.CONFLICT);
        });

        var pending = new PartyPending();
        pending.setParty(party);
        pending.setKind(PartyPendingKind.INVITE);
        pending.setInitiator(member);
        pending.setTarget(target);
        savePending(pending);

        publishBoard();
        return getBoard(actor);
    }

    @Transactional
    public PartyBoardResponse acceptPending(Long pendingId, MemberPrincipal actor) {
        var member = requireApproved(actor);
        var pending = partyPendingRepository.findById(pendingId)
                .orElseThrow(() -> new AppException("Solicitação não encontrada", HttpStatus.NOT_FOUND));
        if (pending.getStatus() != PartyPendingStatus.PENDING) {
            throw new AppException("Solicitação já foi resolvida", HttpStatus.BAD_REQUEST);
        }

        var party = partyRepository.findByIdForUpdate(pending.getParty().getId())
                .orElseThrow(() -> new AppException("PT não encontrada", HttpStatus.NOT_FOUND));
        var map = party.getMap();

        if (pending.getKind() == PartyPendingKind.JOIN_REQUEST) {
            if (!canManageParty(party, member)) {
                throw new AppException("Sem permissão para aceitar pedidos nesta PT", HttpStatus.FORBIDDEN);
            }
            addMemberLocked(party, pending.getInitiator());
            pending.setStatus(PartyPendingStatus.ACCEPTED);
        } else {
            if (!pending.getTarget().getId().equals(member.getId())) {
                throw new AppException("Apenas o convidado pode aceitar o convite", HttpStatus.FORBIDDEN);
            }
            addMemberLocked(party, member);
            pending.setStatus(PartyPendingStatus.ACCEPTED);
        }
        savePending(pending);
        long joinedMemberId = pending.getKind() == PartyPendingKind.JOIN_REQUEST
                ? pending.getInitiator().getId()
                : member.getId();
        cancelOtherPendingForMember(joinedMemberId);
        rejectRemainingJoinRequestsIfFull(party.getId());

        publishBoard();
        return getBoard(actor);
    }

    @Transactional
    public PartyBoardResponse rejectPending(Long pendingId, MemberPrincipal actor) {
        var member = requireApproved(actor);
        var pending = partyPendingRepository.findById(pendingId)
                .orElseThrow(() -> new AppException("Solicitação não encontrada", HttpStatus.NOT_FOUND));
        if (pending.getStatus() != PartyPendingStatus.PENDING) {
            throw new AppException("Solicitação já foi resolvida", HttpStatus.BAD_REQUEST);
        }

        assertCanResolvePending(pending, member);
        pending.setStatus(PartyPendingStatus.REJECTED);
        savePending(pending);

        var map = pending.getParty().getMap();
        publishBoard();
        return getBoard(actor);
    }

    @Transactional
    public PartyBoardResponse cancelPending(Long pendingId, MemberPrincipal actor) {
        var member = requireApproved(actor);
        var pending = partyPendingRepository.findById(pendingId)
                .orElseThrow(() -> new AppException("Solicitação não encontrada", HttpStatus.NOT_FOUND));
        if (pending.getStatus() != PartyPendingStatus.PENDING) {
            throw new AppException("Solicitação já foi resolvida", HttpStatus.BAD_REQUEST);
        }
        if (!pending.getInitiator().getId().equals(member.getId())) {
            throw new AppException("Apenas quem iniciou pode cancelar", HttpStatus.FORBIDDEN);
        }

        pending.setStatus(PartyPendingStatus.CANCELLED);
        savePending(pending);

        var map = pending.getParty().getMap();
        publishBoard();
        return getBoard(actor);
    }

    @Transactional
    public PartyBoardResponse upsertLfg(UpsertLfgRequest request, MemberPrincipal actor) {
        var member = requireApproved(actor);
        if (partyMemberRepository.findByMemberId(member.getId()).isPresent()) {
            throw new AppException("Saia da PT antes de entrar na lista de espera", HttpStatus.BAD_REQUEST);
        }

        var existing = partyLfgRepository.findByMemberId(member.getId());

        PartyLfg entry;
        if (existing.isPresent()) {
            entry = existing.get();
        } else {
            entry = new PartyLfg();
            entry.setMemberId(member.getId());
            entry.setCreatedAt(Instant.now());
        }
        entry.setNote(request.note() != null && !request.note().isBlank() ? request.note().trim() : null);
        partyLfgRepository.save(entry);

        publishBoard();
        return getBoard(actor);
    }

    @Transactional
    public PartyBoardResponse leaveLfg(MemberPrincipal actor) {
        var member = requireApproved(actor);
        var existing = partyLfgRepository.findByMemberId(member.getId());
        if (existing.isEmpty()) {
            throw new AppException("Você não está na lista de espera", HttpStatus.BAD_REQUEST);
        }
        partyLfgRepository.delete(existing.get());
        publishBoard();
        return getBoard(actor);
    }

    /** Admin: takes another member off the waiting list. */
    @Transactional
    public PartyBoardResponse removeFromLfg(Long memberId, MemberPrincipal actor) {
        var organizer = requireApproved(actor);
        if (!canOrganizeParties(organizer)) {
            throw new AppException(
                    "Apenas administradores podem remover membros da lista de espera",
                    HttpStatus.FORBIDDEN);
        }
        var existing = partyLfgRepository.findByMemberId(memberId)
                .orElseThrow(() -> new AppException("Membro não está na lista de espera", HttpStatus.BAD_REQUEST));
        partyLfgRepository.delete(existing);
        publishBoard();
        return getBoard(actor);
    }

    /** Admin: puts another approved member on the waiting list (the queue clock starts now). */
    @Transactional
    public PartyBoardResponse addMemberToLfg(Long memberId, MemberPrincipal actor) {
        var organizer = requireApproved(actor);
        if (!canOrganizeParties(organizer)) {
            throw new AppException(
                    "Apenas administradores podem adicionar membros à lista de espera",
                    HttpStatus.FORBIDDEN);
        }
        var member = memberRepository.findById(memberId)
                .orElseThrow(() -> new AppException("Membro não encontrado", HttpStatus.NOT_FOUND));
        if (member.getStatus() != MemberStatus.APROVADO) {
            throw new AppException("Membro não está aprovado", HttpStatus.BAD_REQUEST);
        }
        if (partyMemberRepository.findByMemberId(memberId).isPresent()) {
            throw new AppException("Membro já está em uma PT", HttpStatus.BAD_REQUEST);
        }
        if (partyLfgRepository.findByMemberId(memberId).isPresent()) {
            throw new AppException("Membro já está na lista de espera", HttpStatus.BAD_REQUEST);
        }

        var entry = new PartyLfg();
        entry.setMemberId(memberId);
        entry.setCreatedAt(Instant.now());
        partyLfgRepository.save(entry);
        publishBoard();
        return getBoard(actor);
    }

    private void addMemberLocked(Party party, Member newMember) {
        if (partyMemberRepository.findByMemberId(newMember.getId()).isPresent()) {
            throw new AppException("Membro já está em uma PT", HttpStatus.BAD_REQUEST);
        }
        if (partyMemberRepository.countByPartyId(party.getId()) >= Party.MAX_MEMBERS) {
            throw new AppException("PT cheia", HttpStatus.BAD_REQUEST);
        }
        long countBefore = partyMemberRepository.countByPartyId(party.getId());
        addMemberRow(party.getId(), newMember.getId());
        partyLfgRepository.findByMemberId(newMember.getId()).ifPresent(partyLfgRepository::delete);
        if (countBefore == 0 || party.getLeader() == null) {
            party.setLeader(newMember);
            partyRepository.save(party);
        }
    }

    private void addMemberRow(Long partyId, Long memberId) {
        var row = new PartyMember();
        row.setPartyId(partyId);
        row.setMemberId(memberId);
        row.setJoinedAt(Instant.now());
        partyMemberRepository.save(row);
    }

    private void cancelOtherPendingForMember(Long memberId) {
        for (var p : partyPendingRepository.findActiveForMember(memberId, PartyPendingStatus.PENDING)) {
            p.setStatus(PartyPendingStatus.CANCELLED);
            savePending(p);
        }
    }

    private void rejectRemainingJoinRequestsIfFull(Long partyId) {
        if (partyMemberRepository.countByPartyId(partyId) < Party.MAX_MEMBERS) {
            return;
        }
        partyPendingRepository.findByPartyIdAndStatus(partyId, PartyPendingStatus.PENDING).forEach(p -> {
            if (p.getKind() == PartyPendingKind.JOIN_REQUEST) {
                p.setStatus(PartyPendingStatus.REJECTED);
                savePending(p);
            }
        });
    }

    private void cancelPendingInvolvingMemberInParty(Long partyId, Long memberId) {
        partyPendingRepository.findByPartyIdAndStatus(partyId, PartyPendingStatus.PENDING).forEach(p -> {
            if (p.getInitiator().getId().equals(memberId) || p.getTarget().getId().equals(memberId)) {
                p.setStatus(PartyPendingStatus.CANCELLED);
                savePending(p);
            }
        });
    }

    private void assertCanResolvePending(PartyPending pending, Member actor) {
        if (pending.getKind() == PartyPendingKind.JOIN_REQUEST) {
            if (!canManageParty(pending.getParty(), actor)) {
                throw new AppException("Sem permissão para responder pedidos nesta PT", HttpStatus.FORBIDDEN);
            }
        } else if (!pending.getTarget().getId().equals(actor.getId())) {
            throw new AppException("Apenas o convidado pode responder ao convite", HttpStatus.FORBIDDEN);
        }
    }

    private void removeMemberFromParty(Party party, Long memberId, boolean notifyKicked) {
        Long partyId = party.getId();
        boolean wasLeader =
                party.getLeader() != null && party.getLeader().getId().equals(memberId);
        partyMemberRepository.deleteByPartyIdAndMemberId(partyId, memberId);
        cancelPendingInvolvingMemberInParty(partyId, memberId);

        if (partyMemberRepository.countByPartyId(partyId) == 0) {
            partyRepository.delete(party);
            if (notifyKicked) {
                afterMemberKicked(party, memberId);
            }
            return;
        }

        if (wasLeader) {
            var nextMemberId =
                    partyMemberRepository.findByPartyIdOrderByJoinedAtAsc(partyId).getFirst().getMemberId();
            party.setLeader(memberRepository.findById(nextMemberId).orElseThrow());
            partyRepository.save(party);
        }

        if (notifyKicked) {
            afterMemberKicked(party, memberId);
        }
    }

    private void afterMemberKicked(Party party, Long memberId) {
        upsertLfgForMember(memberId, null);
        publishReturnedToLfgNotice(
                memberId,
                "Você foi removido da PT e entrou na lista de espera global.",
                party.getId(),
                party.getMap());
    }

    private void upsertLfgForMember(Long memberId, String note) {
        var existing = partyLfgRepository.findByMemberId(memberId);
        PartyLfg entry;
        if (existing.isPresent()) {
            entry = existing.get();
        } else {
            entry = new PartyLfg();
            entry.setMemberId(memberId);
            entry.setCreatedAt(Instant.now());
        }
        if (note != null) {
            entry.setNote(note.isBlank() ? null : note.trim());
        }
        partyLfgRepository.save(entry);
    }

    private void publishReturnedToLfgNotice(
            Long memberId, String message, Long partyId, PartyMap partyMap) {
        webSocketPublisher.publishPartyMemberNotice(
                memberId, new PartyMemberNoticeMessage("KICKED_FROM_PARTY", message, partyId, partyMap));
    }

    private boolean canOrganizeParties(Member member) {
        return member.getRole().isAtLeast(Role.ADMINISTRADOR);
    }

    private boolean canManageParty(Party party, Member actor) {
        if (party.getLeader() != null && party.getLeader().getId().equals(actor.getId())) {
            return true;
        }
        return canOrganizeParties(actor);
    }

    private MyPartyState buildMyState(
            Member member, Map<Long, Member> memberLookup, Map<Long, Integer> displayNumbers) {
        var membership = partyMemberRepository.findByMemberId(member.getId());
        Long partyId = null;
        Integer partyNumber = null;
        PartyMap partyMap = null;
        String partySpot = null;
        boolean leader = false;

        if (membership.isPresent()) {
            var party = partyRepository.findById(membership.get().getPartyId()).orElseThrow();
            partyId = party.getId();
            partyNumber = displayNumbers.get(party.getId());
            partyMap = party.getMap();
            partySpot = party.getSpot();
            leader = party.getLeader() != null && party.getLeader().getId().equals(member.getId());
        }

        PartyLfgEntry lfgEntry = partyLfgRepository.findByMemberId(member.getId())
                .map(lfg -> toLfgEntry(lfg, memberLookup))
                .orElse(null);

        var pendingIds = new HashSet<Long>();
        var pending = new ArrayList<PartyPendingResponse>();
        partyPendingRepository.findActiveForMember(member.getId(), PartyPendingStatus.PENDING).forEach(p -> {
            pendingIds.add(p.getId());
            pending.add(toPendingResponse(p, member.getId()));
        });

        if (canOrganizeParties(member)) {
            for (PartyMap partyMapKey : PartyMap.values()) {
                partyPendingRepository
                        .findJoinRequestsByMap(partyMapKey, PartyPendingStatus.PENDING)
                        .forEach(p -> {
                            if (!pendingIds.contains(p.getId())) {
                                pendingIds.add(p.getId());
                                pending.add(toPendingResponse(p, member.getId()));
                            }
                        });
            }
        }

        return new MyPartyState(
                member.getId(),
                partyId,
                partyNumber,
                partyMap,
                partySpot,
                leader,
                canOrganizeParties(member),
                lfgEntry,
                pending);
    }

    private PartyPendingResponse toPendingResponse(PartyPending p, Long viewerId) {
        Member other = p.getInitiator().getId().equals(viewerId) ? p.getTarget() : p.getInitiator();
        return new PartyPendingResponse(
                p.getId(),
                p.getKind(),
                p.getParty().getId(),
                p.getParty().getMap(),
                toMemberSummary(
                        other,
                        p.getParty().getLeader() != null
                                && p.getParty().getLeader().getId().equals(other.getId())),
                p.getCreatedAt()
        );
    }

    private PartySummary toPartySummary(
            Party party,
            List<PartyMember> members,
            Map<Long, Member> memberLookup,
            int number) {
        Long leaderId = party.getLeader() != null ? party.getLeader().getId() : null;
        var summaries = members.stream()
                .map(pm -> {
                    Member m = pm.getMember();
                    if (m == null) {
                        m = memberLookup.get(pm.getMemberId());
                    }
                    if (m == null) {
                        throw new AppException("Membro da PT não encontrado", HttpStatus.INTERNAL_SERVER_ERROR);
                    }
                    return toMemberSummary(m, leaderId != null && pm.getMemberId().equals(leaderId));
                })
                .toList();
        return new PartySummary(
                party.getId(),
                number,
                party.getMap(),
                party.getSpot(),
                leaderId,
                summaries,
                summaries.size());
    }

    private PartyMemberSummary toMemberSummary(Member m, boolean leader) {
        var cls = m.getCharacterClass();
        var gs = characterStatusRepository
                .findFirstByMemberIdOrderByUpdatedAtDesc(m.getId()).orElse(null);
        return new PartyMemberSummary(
                m.getId(),
                m.getNickname(),
                cls != null ? cls.getName() : null,
                cls != null ? cls.getImageUrl() : null,
                gameLevel(m, gs),
                gs != null ? gs.getExpPercent() : null,
                leader
        );
    }

    /** Level do jogo (enviado pelo cliente); cai para o level da guilda/1 se nao houver status. */
    private int gameLevel(Member m, CharacterStatus gs) {
        if (gs != null) {
            return gs.getLevel();
        }
        return m.getLevel() != null ? m.getLevel() : 1;
    }

    private PartyLfgEntry toLfgEntry(PartyLfg lfg, Map<Long, Member> memberLookup) {
        Member m = lfg.getMember();
        if (m == null) {
            m = memberLookup.get(lfg.getMemberId());
        }
        if (m == null) {
            throw new AppException("Membro da lista de espera não encontrado", HttpStatus.INTERNAL_SERVER_ERROR);
        }
        var cls = m.getCharacterClass();
        var gs = characterStatusRepository
                .findFirstByMemberIdOrderByUpdatedAtDesc(m.getId()).orElse(null);
        return new PartyLfgEntry(
                m.getId(),
                m.getNickname(),
                cls != null ? cls.getName() : null,
                cls != null ? cls.getImageUrl() : null,
                gameLevel(m, gs),
                gs != null ? gs.getExpPercent() : null,
                lfg.getNote(),
                lfg.getCreatedAt()
        );
    }

    private Member requireApproved(MemberPrincipal actor) {
        var member = memberRepository.findById(actor.getId())
                .orElseThrow(() -> new AppException("Membro não encontrado", HttpStatus.NOT_FOUND));
        if (member.getStatus() != MemberStatus.APROVADO) {
            throw new AppException("Acesso negado", HttpStatus.FORBIDDEN);
        }
        return member;
    }

    private void ensureNotInParty(Long memberId) {
        if (partyMemberRepository.findByMemberId(memberId).isPresent()) {
            throw new AppException("Você já está em uma PT", HttpStatus.BAD_REQUEST);
        }
    }

    private void publishBoard() {
        partyBoardBroadcaster.boardChanged();
    }

    /** Every pending write goes through here so the involved members are told to refresh. */
    private void savePending(PartyPending pending) {
        partyPendingRepository.save(pending);
        partyBoardBroadcaster.pendingChanged(pending);
    }

    private Map<Long, Integer> computeDisplayNumbers(List<Party> parties) {
        Map<Long, Integer> numbers = new HashMap<>();
        Map<PartyMap, Integer> perMap = new EnumMap<>(PartyMap.class);
        for (Party party : parties) {
            int next = perMap.getOrDefault(party.getMap(), 0) + 1;
            perMap.put(party.getMap(), next);
            numbers.put(party.getId(), next);
        }
        return numbers;
    }

    private String normalizeSpot(String spot) {
        if (spot == null || spot.isBlank()) {
            return null;
        }
        return spot.trim();
    }

    private void applyMapAndSpot(Party party, PartyMap map, String spot) {
        party.setMap(map);
        if (map == PartyMap.SEM_MAPA) {
            party.setSpot(null);
        } else {
            party.setSpot(normalizeSpot(spot));
        }
    }
}
