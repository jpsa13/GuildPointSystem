package com.guild.app.characterstatus;

import com.guild.app.characterstatus.dto.CharacterStatusIngestRequest;
import com.guild.app.characterstatus.service.CharacterStatusService;
import com.guild.app.characterstatus.service.SyncAccessService;
import com.guild.app.websocket.WebSocketPublisher;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.time.Instant;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

/** Personagem compartilhado: o mesmo nick em mais de uma conta sincroniza todas elas. */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class CharacterStatusSharedNickTest {
    @Autowired CharacterStatusService service;
    @Autowired SyncAccessService syncAccess;
    @Autowired JdbcTemplate jdbc;
    @MockitoBean WebSocketPublisher ws;
    String nick;

    long member(String nickname, String status) {
        return jdbc.queryForObject("INSERT INTO member(nickname,role,status,profile_complete) VALUES(?,'MEMBRO',?,true) RETURNING id",
            Long.class, nickname, status);
    }
    void send(String character) {
        service.ingest(new CharacterStatusIngestRequest(77L, character, 50, 12.5f, 100, 100, 50, 50, 30, 30));
    }
    @BeforeEach void setup() { nick = "Shr" + UUID.randomUUID().toString().replace("-", "").substring(0, 8); }

    @Test void everyActiveAccountWithTheNickIsSynced() {
        long first = member(nick, "APROVADO");
        long second = member(nick.toUpperCase(), "APROVADO");
        long deleted = member(nick, "EXCLUIDO");
        send(nick.toLowerCase());

        assertEquals(1, service.myStatuses(first).size());
        assertEquals(1, service.myStatuses(second).size());
        assertEquals(0, service.myStatuses(deleted).size());
        assertTrue(syncAccess.status(first, Instant.now()).synced());
        assertTrue(syncAccess.status(second, Instant.now()).synced());
    }
    @Test void onlyDeletedAccountsMeansNoMember() {
        member(nick, "EXCLUIDO");
        assertThrows(ResponseStatusException.class, () -> send(nick));
    }
}
