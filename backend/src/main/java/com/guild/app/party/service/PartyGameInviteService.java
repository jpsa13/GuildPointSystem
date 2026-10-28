package com.guild.app.party.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.guild.app.auth.security.MemberPrincipal;
import com.guild.app.common.enums.*;
import com.guild.app.common.exception.AppException;
import com.guild.app.log.service.AuditLogService;
import com.guild.app.member.entity.Member;
import com.guild.app.member.repository.MemberRepository;
import com.guild.app.party.repository.PartyMemberRepository;
import com.guild.app.party.repository.PartyRepository;
import com.guild.app.websocket.WebSocketPublisher;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.*;

/**
 * Convite de PT pelo jogo: o líder (ou a organização) pede no site, e a DLL do cliente do
 * LÍDER busca o pedido e digita "@party Nick" para cada integrante. Criar exige login;
 * a busca e a conclusão são públicas e ligadas pelo nome do personagem, como os outros
 * envios da DLL. Cada pedido é entregue uma única vez, para não repetir convites.
 */
@Service
@RequiredArgsConstructor
public class PartyGameInviteService {
    static final int VALID_SECONDS = 120;
    static final int COOLDOWN_SECONDS = 30;
    private static final String NICK = "[A-Za-z0-9_-]{2,16}";

    private final JdbcTemplate jdbc;
    private final PartyRepository parties;
    private final PartyMemberRepository roster;
    private final MemberRepository members;
    private final AuditLogService audit;
    private final ObjectMapper json;
    private final WebSocketPublisher ws;
    Clock clock = Clock.systemUTC();

    public record InviteView(Long partyId, UUID id, String leader, String state, List<String> nicks,
                             List<String> skipped, Instant createdAt, Instant expiresAt) {}
    public record PendingInvite(UUID id, List<String> nicks) {}
    /** Aviso ao convidado; inviteId deixa o site tocar o som uma vez só por chamado, mesmo com várias abas. */
    public record InviteNotice(String type, String message, Long partyId, UUID inviteId) {}

    private Member approved(MemberPrincipal actor) {
        var member = members.findById(actor.getId()).orElseThrow(() -> new AppException("Membro não encontrado", HttpStatus.NOT_FOUND));
        if (!eligible(member)) throw new AppException("Acesso negado", HttpStatus.FORBIDDEN);
        return member;
    }
    private static boolean eligible(Member member) {
        return member.getStatus() == MemberStatus.APROVADO && member.isProfileComplete()
            && member.getDeletedAt() == null && member.getSuspendedAt() == null;
    }

    @Transactional
    public InviteView start(Long partyId, MemberPrincipal actor) {
        Member member = approved(actor);
        var party = parties.findByIdForUpdate(partyId).orElseThrow(() -> new AppException("PT não encontrada", HttpStatus.NOT_FOUND));
        boolean leader = party.getLeader() != null && party.getLeader().getId().equals(member.getId());
        if (!leader && !member.getRole().isAtLeast(Role.ADMINISTRADOR))
            throw new AppException("Apenas o líder desta PT ou um organizador pode chamá-la no jogo.", HttpStatus.FORBIDDEN);
        Member partyLeader = party.getLeader();
        if (partyLeader == null || !partyLeader.getNickname().matches(NICK))
            throw new AppException("O líder desta PT não tem um nick válido no jogo.", HttpStatus.BAD_REQUEST);
        Instant now = clock.instant();
        var previous = view(partyId);
        if (previous != null) {
            if (previous.state().equals("WAITING"))
                throw new AppException("Já existe um chamado aguardando o jogo do líder.", HttpStatus.CONFLICT);
            if (now.isBefore(previous.createdAt().plusSeconds(COOLDOWN_SECONDS)))
                throw new AppException("Aguarde alguns segundos antes de chamar de novo.", HttpStatus.CONFLICT);
        }
        var nicks = new ArrayList<String>();
        var skipped = new ArrayList<String>();
        for (var entry : roster.findByPartyIdInWithMember(List.of(partyId))) {
            var m = entry.getMember();
            if (m.getId().equals(partyLeader.getId())) continue;
            if (eligible(m) && m.getNickname().matches(NICK)) nicks.add(m.getNickname());
            else skipped.add(m.getNickname());
        }
        if (nicks.isEmpty()) throw new AppException("Nenhum integrante desta PT pode ser chamado no jogo.", HttpStatus.BAD_REQUEST);
        UUID id = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO party_game_invite(party_id,id,leader_id,actor_id,nicks,skipped,created_at,expires_at)
            VALUES(?,?,?,?,?::jsonb,?::jsonb,?,?)
            ON CONFLICT(party_id) DO UPDATE SET id=EXCLUDED.id,leader_id=EXCLUDED.leader_id,actor_id=EXCLUDED.actor_id,
                nicks=EXCLUDED.nicks,skipped=EXCLUDED.skipped,created_at=EXCLUDED.created_at,expires_at=EXCLUDED.expires_at,
                delivered_at=NULL,completed_at=NULL
            """, partyId, id, partyLeader.getId(), member.getId(), encode(nicks), encode(skipped),
            Timestamp.from(now), Timestamp.from(now.plusSeconds(VALID_SECONDS)));
        audit.log(AuditLogType.PARTY_GAME_INVITE, member, partyLeader,
            Map.of("partyId", partyId, "inviteId", id.toString(), "nicks", nicks, "skipped", skipped));
        return view(partyId);
    }

    @Transactional(readOnly = true)
    public InviteView current(Long partyId, MemberPrincipal actor) {
        approved(actor);
        return view(partyId);
    }

    /**
     * Busca da DLL: entrega o pedido válido do líder uma única vez. Personagem compartilhado
     * (mesmo nick em mais de uma conta): vale o pedido de qualquer uma delas.
     */
    @Transactional
    public Optional<PendingInvite> pending(String character) {
        Instant now = clock.instant();
        for (Member leader : members.findByGameCharacter(character)) {
            if (!eligible(leader)) continue;
            var rows = jdbc.queryForList("""
                SELECT party_id,id,nicks FROM party_game_invite
                WHERE leader_id=? AND delivered_at IS NULL AND expires_at>? ORDER BY created_at LIMIT 1 FOR UPDATE
                """, leader.getId(), Timestamp.from(now));
            if (rows.isEmpty()) continue;
            var row = rows.getFirst();
            jdbc.update("UPDATE party_game_invite SET delivered_at=? WHERE party_id=?", Timestamp.from(now), row.get("party_id"));
            return Optional.of(new PendingInvite((UUID) row.get("id"), decode(row.get("nicks").toString())));
        }
        return Optional.empty();
    }

    /**
     * Conclusão informada pela DLL do mesmo líder que recebeu o pedido. Cada convidado recebe o
     * aviso PARTY_GAME_INVITE no seu tópico, e o site toca o som de "aceita a PT".
     */
    @Transactional
    public boolean done(UUID id, String character) {
        for (Member leader : members.findByGameCharacter(character)) {
            var rows = jdbc.queryForList("""
                UPDATE party_game_invite SET completed_at=? WHERE id=? AND leader_id=? AND delivered_at IS NOT NULL AND completed_at IS NULL
                RETURNING party_id,nicks
                """, Timestamp.from(clock.instant()), id, leader.getId());
            if (rows.isEmpty()) continue;
            Long partyId = ((Number) rows.getFirst().get("party_id")).longValue();
            String message = leader.getNickname() + " te convidou para a PT no jogo.";
            for (String nick : decode(rows.getFirst().get("nicks").toString()))
                for (Member invited : members.findByGameCharacter(nick))
                    ws.publishPartyMemberNotice(invited.getId(), new InviteNotice("PARTY_GAME_INVITE", message, partyId, id));
            return true;
        }
        return false;
    }

    private InviteView view(Long partyId) {
        Instant now = clock.instant();
        return jdbc.query("""
            SELECT g.*,m.nickname FROM party_game_invite g JOIN member m ON m.id=g.leader_id WHERE g.party_id=?
            """, (r, n) -> {
            Instant expires = r.getTimestamp("expires_at").toInstant();
            String state = r.getTimestamp("completed_at") != null ? "COMPLETE"
                : r.getTimestamp("delivered_at") != null ? "DELIVERED"
                : now.isBefore(expires) ? "WAITING" : "EXPIRED";
            return new InviteView(partyId, (UUID) r.getObject("id"), r.getString("nickname"), state,
                decode(r.getString("nicks")), decode(r.getString("skipped")),
                r.getTimestamp("created_at").toInstant(), expires);
        }, partyId).stream().findFirst().orElse(null);
    }
    private String encode(List<String> value) {
        try { return json.writeValueAsString(value); } catch (JsonProcessingException e) { throw new IllegalStateException(e); }
    }
    private List<String> decode(String value) {
        try { return json.readValue(value, new TypeReference<List<String>>() {}); } catch (JsonProcessingException e) { throw new IllegalStateException(e); }
    }
}
