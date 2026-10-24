package com.guild.app.party;

import com.guild.app.party.entity.PartyDiscordCall;
import com.guild.app.party.repository.PartyDiscordCallRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.test.context.ActiveProfiles;
import java.time.Instant;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

@DataJpaTest
@AutoConfigureTestDatabase(replace=AutoConfigureTestDatabase.Replace.NONE)
@ActiveProfiles("test")
class PartyDiscordPersistenceTest {
    @org.springframework.test.context.bean.override.mockito.MockitoBean
    com.guild.app.auth.security.MemberPrincipalCache memberCache;
    @Autowired PartyDiscordCallRepository calls;
    @Autowired EntityManager em;

    @Test void persistsNestedJsonAndFindsReactionMessageAfterReload() {
        var call=new PartyDiscordCall();
        call.setPartyId(-9223372036854775807L); call.setRunId(UUID.randomUUID()); call.setActorId(1L);
        call.setLabel("PT de teste"); call.setChannelId("77777777777777777");
        call.setStartedAt(Instant.now()); call.setNextAt(Instant.now()); call.setState("WAITING");
        call.getRecipients().add(new PartyDiscordCall.Recipient(1L,"20000000000000001","Player"));
        calls.saveAndFlush(call); em.clear();
        var reloaded=calls.lock(call.getPartyId()).orElseThrow();
        reloaded.getConfirmed().add("20000000000000001");
        reloaded.getMessages().add("10000000000000001");
        reloaded.setSent(1); reloaded.setState("COMPLETE");
        em.flush(); em.clear();
        var saved=calls.findById(call.getPartyId()).orElseThrow();
        assertEquals(call.getRunId(),saved.getRunId());
        assertEquals(call.getRecipients(),saved.getRecipients());
        assertEquals(Set.of("20000000000000001"),saved.getConfirmed());
        assertEquals(List.of(call.getPartyId()),calls.findMessage(call.getChannelId(),"[\"10000000000000001\"]"));
        assertTrue(calls.findMessage("wrong","[\"10000000000000001\"]").isEmpty());
    }
}
