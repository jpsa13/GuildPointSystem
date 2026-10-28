package com.guild.app.quest;

import com.guild.app.quest.dto.QuestStatusIngestRequest;
import com.guild.app.quest.repository.QuestStatusRepository;
import com.guild.app.quest.service.QuestStatusService;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class QuestStatusServiceTest {
    @Autowired QuestStatusService service;
    @Autowired JdbcTemplate jdbc;
    @Autowired QuestStatusRepository statuses;
    long memberId;
    String nick;
    // Q071356 / Q082000 / Q082010 em inteiro.
    static final int A = 0x071356, B = 0x082000, C = 0x082010;

    @BeforeEach void setup() {
        nick = "Qst" + UUID.randomUUID().toString().replace("-", "").substring(0, 8);
        memberId = jdbc.queryForObject("INSERT INTO member(nickname,role,status,profile_complete) VALUES(?,'MEMBRO','APROVADO',true) RETURNING id",
            Long.class, nick);
    }
    void send(List<Integer> active, List<Integer> done) { service.ingest(new QuestStatusIngestRequest(nick, active, done)); }
    Set<String> done() { return service.doneCodesForDay(memberId, QuestStatusService.currentQuestDay()); }

    @Test void reopeningTheGameKeepsTheQuestsAlreadyDoneToday() {
        send(List.of(C), List.of(A, B));
        // Jogo reaberto: a DLL volta sem memória e manda done vazio.
        send(List.of(C), List.of());
        assertEquals(Set.of("Q071356", "Q082000"), done());
        send(List.of(), List.of(C));
        assertEquals(Set.of("Q071356", "Q082000", "Q082010"), done());
    }
    @Test void aQuestActiveAgainStopsCountingAsDone() {
        send(List.of(), List.of(A, B));
        send(List.of(A), List.of());
        assertEquals(Set.of("Q082000"), done());
    }
    @Test void aNewQuestDayStartsEmpty() {
        send(List.of(), List.of(A));
        var status = statuses.findById(memberId).orElseThrow();
        status.setQuestDay(status.getQuestDay().minusDays(1)); // simula a virada das 03h
        statuses.saveAndFlush(status);
        send(List.of(), List.of(B));
        assertEquals(Set.of("Q082000"), done());
    }
}
