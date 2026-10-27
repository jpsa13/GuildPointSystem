package com.guild.app.rotation;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.guild.app.auth.security.MemberPrincipal;
import com.guild.app.member.repository.MemberRepository;
import com.guild.app.rotation.dto.RotationDtos.*;
import com.guild.app.rotation.service.RotationService;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class RotationIntegrationTest {
    @Autowired RotationService service;
    @Autowired JdbcTemplate jdbc;
    @Autowired MemberRepository members;
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    long admin, player;
    long member(String role) {
        return jdbc.queryForObject("INSERT INTO member(nickname,role,status,profile_complete) VALUES(?,?,'APROVADO',true) RETURNING id",Long.class,"Rotation test "+UUID.randomUUID(),role);
    }
    UsernamePasswordAuthenticationToken auth(long id) {
        var principal=new MemberPrincipal(members.findById(id).orElseThrow());
        return new UsernamePasswordAuthenticationToken(principal,null,principal.getAuthorities());
    }
    @BeforeEach void setup() throws Exception {
        admin=member("ADMINISTRADOR"); player=member("MEMBRO");
        SecurityContextHolder.getContext().setAuthentication(auth(admin));
        try(var stream=new ClassPathResource("db/migration/V76__boss_rotation.sql").getInputStream()) {
            var seed=new String(stream.readAllBytes(),java.nio.charset.StandardCharsets.UTF_8).split("\\$rotation\\$")[1];
            jdbc.update("UPDATE boss_rotation SET slots=?::jsonb,version=0 WHERE id=1",seed);
        }
    }
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }
    @Test void officialEquipmentMigrationAndRotationMigrationCoexist() {
        assertEquals("equipment game client origin",jdbc.queryForObject("SELECT description FROM flyway_schema_history WHERE version='72' AND success",String.class));
        assertEquals("boss rotation",jdbc.queryForObject("SELECT description FROM flyway_schema_history WHERE version='76' AND success",String.class));
    }
    @Test void suppliedScheduleTotalsMatchImage() {
        var schedule=service.read();
        assertEquals(List.of("02:00","06:00","10:00","14:00","18:00","22:00"),schedule.slots().stream().map(Slot::time).toList());
        var expected=Map.of(Guild.Energy,List.of(0,6),Guild.Espada,List.of(0,5),Guild.Quit,List.of(6,4),Guild.Devotion,List.of(6,3),Guild.Yonkou,List.of(6,3),Guild.Blacklist,List.of(6,3));
        for(var guild:Guild.values()) {
            var qg=schedule.slots().stream().flatMap(s->s.qg().stream()).filter(a->a.guild()==guild).mapToInt(a->a.bosses().size()).sum();
            var outpost=schedule.slots().stream().flatMap(s->s.outpost().stream()).filter(a->a.guild()==guild).mapToInt(a->a.bosses().size()).sum();
            assertEquals(expected.get(guild),List.of(qg,outpost));
        }
    }
    @Test void memberReadsButCannotEditAndAnonymousCannotRead() throws Exception {
        var request=new Update(0,service.read().slots());
        mvc.perform(get("/api/rotation/bosses").with(authentication(auth(player)))).andExpect(status().isOk());
        mvc.perform(put("/api/rotation/bosses").with(authentication(auth(player))).contentType("application/json").content(json.writeValueAsString(request))).andExpect(status().isForbidden());
        mvc.perform(get("/api/rotation/bosses").with(anonymous())).andExpect(status().isUnauthorized());
        SecurityContextHolder.getContext().setAuthentication(auth(player));
        assertThrows(RuntimeException.class,()->service.update(request));
    }
    @Test void saveIsAuditedAndRejectsStaleVersion() {
        var request=new Update(0,List.of(new Slot("03:00",List.of(new Assignment(Guild.Quit,List.of("Boss teste"))),List.of())));
        assertEquals(1,service.update(request).version());
        assertEquals("03:00",service.read().slots().getFirst().time());
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM audit_log WHERE actor_id=? AND type='ROTATION_UPDATED'",Integer.class,admin));
        assertThrows(RuntimeException.class,()->service.update(request));
        assertEquals(1,service.read().version());
    }
    @Test void invalidTimeDuplicateBossAndDuplicateSlotAreRejected() throws Exception {
        mvc.perform(put("/api/rotation/bosses").with(authentication(auth(admin))).contentType("application/json")
            .content("{\"version\":0,\"slots\":[{\"time\":\"25:00\",\"qg\":[],\"outpost\":[]}]}"))
            .andExpect(status().isBadRequest());
        SecurityContextHolder.getContext().setAuthentication(auth(admin));
        var slot=new Slot("02:00",List.of(new Assignment(Guild.Quit,List.of("Boss")),new Assignment(Guild.Energy,List.of(" boss "))),List.of());
        assertThrows(RuntimeException.class,()->service.update(new Update(0,List.of(slot))));
        var first=service.read().slots().getFirst();
        assertThrows(RuntimeException.class,()->service.update(new Update(0,List.of(first,first))));
        assertEquals(0,service.read().version());
    }
}
