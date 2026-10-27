package com.guild.app.quest.repository;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.guild.app.quest.dto.QuestDtos.*;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;

@Repository
@RequiredArgsConstructor
public class QuestRepository {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    public record Owner(UUID sessionId, long memberId, Instant expiresAt, Instant revokedAt) {}
    public record LiveOwner(Owner owner,String source,String expectedName,String epoch,Long serial,Long sequence,PlayerSample sample) {}
    public LiveOwner liveOwner(UUID id) {
        return jdbc.query("SELECT * FROM quest_monitor_session WHERE id=?",(r,n)->new LiveOwner(
            new Owner(id,r.getLong("member_id"),r.getTimestamp("expires_at").toInstant(),instant(r.getTimestamp("revoked_at"))),
            r.getString("source"),r.getString("expected_name"),r.getString("identity_epoch"),r.getObject("character_serial",Long.class),
            r.getObject("sample_sequence",Long.class),r.getString("player_sample")==null?null:decodeSample(r.getString("player_sample"))),id).getFirst();
    }
    public void makeLive(UUID id,String name) {
        jdbc.update("UPDATE quest_monitor_session SET source='LOCAL_MONITOR',expected_name=? WHERE id=?",name,id);
    }
    public void revokeOtherLive(long memberId,UUID id) {
        jdbc.update("UPDATE quest_monitor_session SET revoked_at=now() WHERE member_id=? AND source='LOCAL_MONITOR' AND id<>? AND revoked_at IS NULL",memberId,id);
    }
    public void sample(UUID id,PlayerSample sample) {
        jdbc.update("UPDATE quest_monitor_session SET identity_epoch=?,character_serial=?,sample_sequence=?,player_sample=?::jsonb,last_received_at=now() WHERE id=?",
            sample.identityEpoch(),sample.serial(),sample.sequence(),encodeValue(sample),id);
    }
    public PlayerStatus player(long memberId) {
        return jdbc.query("""
            SELECT * FROM quest_monitor_session WHERE member_id=? AND source='LOCAL_MONITOR' AND player_sample IS NOT NULL
            ORDER BY last_received_at DESC,id DESC LIMIT 1
            """,(r,n)->new PlayerStatus(r.getObject("id",UUID.class),decodeSample(r.getString("player_sample")),
                r.getTimestamp("last_received_at").toInstant(),r.getTimestamp("revoked_at")!=null || !r.getTimestamp("expires_at").toInstant().isAfter(Instant.now())),memberId)
            .stream().findFirst().orElse(null);
    }
    public void visibility(long actorId,String hash,boolean hidden) {
        jdbc.update("INSERT INTO quest_catalog_visibility(definition_hash,hidden,updated_by) VALUES(?,?,?) ON CONFLICT(definition_hash) DO UPDATE SET hidden=excluded.hidden,updated_by=excluded.updated_by,updated_at=now()",hash,hidden,actorId);
    }
    public Map<String,Boolean> visibility() {
        var result=new HashMap<String,Boolean>();
        jdbc.query("SELECT definition_hash,hidden FROM quest_catalog_visibility",(org.springframework.jdbc.core.RowCallbackHandler) r->result.put(r.getString(1),r.getBoolean(2)));
        return result;
    }
    public Map<String,Long> signals(long memberId,Instant start,Instant end) {
        var result=new HashMap<String,Long>();
        // Include the confirmed Easy delivery captured before its detector was enabled, preserving the original event.
        jdbc.query("""
            SELECT o.code,count(DISTINCT (o.session_id,o.run_id)) AS total FROM quest_observation o JOIN quest_monitor_session s ON s.id=o.session_id
            WHERE s.member_id=? AND s.source='LOCAL_MONITOR' AND (o.state='COMPLETION_SIGNAL' OR (
                o.state='STATE_CHANGED' AND o.code='Q071396'
                AND o.client_hash='8343dc2afba9537f5c41c713b3af5516d0be75f6ad9a9bdb6ed9722238645379'
                AND o.edf_hash='fa5e6d236cce98265cae4fc3bc5374ba8560824bbdef94ffb0ed8ec269456e98'
                AND o.definition_hash='94e3b2f4d52c89ef506e66ba5404deaec370d85a7a48f695ab96ab76dba66177'
                AND (o.payload->>'group')::int=1 AND (o.payload->>'type')::int=1 AND (o.payload->>'slot')::int=111
                AND EXISTS (SELECT 1 FROM quest_observation p WHERE p.session_id=o.session_id AND p.run_id=o.run_id
                    AND p.sequence=o.sequence-1 AND p.state='PRESENT' AND (p.payload->>'slot')::int=8)))
            AND o.occurred_at>=? AND o.occurred_at<? GROUP BY o.code
            """,(org.springframework.jdbc.core.RowCallbackHandler) r->result.put(r.getString(1),r.getLong(2)),memberId,Timestamp.from(start),Timestamp.from(end));
        return result;
    }
    public void create(UUID id, long memberId, String hash, String version, Instant expires) {
        jdbc.update("INSERT INTO quest_monitor_session(id,member_id,token_hash,monitor_version,source,expires_at) VALUES(?,?,?,?,'SIMULATION',?)",
            id,memberId,hash,version,Timestamp.from(expires));
    }
    public int activeSessions(long memberId) {
        return jdbc.queryForObject("SELECT count(*) FROM quest_monitor_session WHERE member_id=? AND revoked_at IS NULL AND expires_at>now()",Integer.class,memberId);
    }
    public Owner lock(String hash) {
        return jdbc.query("SELECT * FROM quest_monitor_session WHERE token_hash=? FOR UPDATE", (r,n)->
            new Owner(r.getObject("id",UUID.class),r.getLong("member_id"),r.getTimestamp("expires_at").toInstant(),instant(r.getTimestamp("revoked_at"))),hash)
            .stream().findFirst().orElse(null);
    }
    public void revoke(long memberId, UUID id) {
        jdbc.update("UPDATE quest_monitor_session SET revoked_at=COALESCE(revoked_at,now()) WHERE member_id=? AND id=?",memberId,id);
    }
    public void received(UUID id) {
        jdbc.update("UPDATE quest_monitor_session SET last_received_at=now() WHERE id=?",id);
    }
    public List<Session> sessions(long memberId) {
        return jdbc.query("SELECT * FROM quest_monitor_session WHERE member_id=? ORDER BY created_at DESC LIMIT 50",(r,n)->
            new Session(r.getObject("id",UUID.class),r.getString("monitor_version"),r.getString("source"),r.getTimestamp("created_at").toInstant(),
                r.getTimestamp("expires_at").toInstant(),instant(r.getTimestamp("revoked_at")),instant(r.getTimestamp("last_received_at"))),memberId);
    }
    public Event existing(UUID session, UUID event) {
        return jdbc.query("SELECT payload::text FROM quest_observation WHERE session_id=? AND event_id=?",(r,n)->decode(r.getString(1)),session,event)
            .stream().findFirst().orElse(null);
    }
    public Event previous(UUID session, UUID run) {
        return jdbc.query("SELECT payload::text FROM quest_observation WHERE session_id=? AND run_id=? ORDER BY sequence DESC LIMIT 1",(r,n)->decode(r.getString(1)),session,run)
            .stream().findFirst().orElse(null);
    }
    public void insert(UUID session, Event event) {
        jdbc.update("""
            INSERT INTO quest_observation(session_id,event_id,run_id,sequence,occurred_at,code,client_hash,edf_hash,definition_hash,state,payload)
            VALUES(?,?,?,?,?,?,?,?,?,?,?::jsonb)
            """,session,event.eventId(),event.runId(),event.sequence(),Timestamp.from(event.occurredAt()),event.code(),event.clientHash(),event.edfHash(),event.definitionHash(),event.state().name(),encode(event));
    }
    public List<Observation> history(long memberId, Instant start, Instant end, long offset) {
        return jdbc.query("""
            SELECT o.*,s.source,s.monitor_version FROM quest_observation o JOIN quest_monitor_session s ON s.id=o.session_id
            WHERE s.member_id=? AND o.occurred_at>=? AND o.occurred_at<?
            ORDER BY o.occurred_at,o.session_id,o.run_id,o.sequence LIMIT 501 OFFSET ?
            """,(r,n)->new Observation(r.getObject("session_id",UUID.class),r.getString("source"),r.getString("monitor_version"),
                decode(r.getString("payload")),r.getTimestamp("received_at").toInstant()),memberId,Timestamp.from(start),Timestamp.from(end),offset);
    }
    private static Instant instant(Timestamp t) { return t==null?null:t.toInstant(); }
    private String encode(Event e) {
        return encodeValue(e);
    }
    private String encodeValue(Object e) { try { return json.writeValueAsString(e); } catch(JsonProcessingException ex) { throw new IllegalStateException(ex); } }
    private PlayerSample decodeSample(String s) { try { return json.readValue(s,PlayerSample.class); } catch(JsonProcessingException ex) { throw new IllegalStateException(ex); } }
    private Event decode(String s) {
        try { return json.readValue(s,Event.class); } catch(JsonProcessingException e) { throw new IllegalStateException(e); }
    }
}
