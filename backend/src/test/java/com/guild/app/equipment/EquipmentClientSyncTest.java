package com.guild.app.equipment;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.guild.app.auth.security.MemberPrincipal;
import com.guild.app.common.enums.*;
import com.guild.app.common.exception.AppException;
import com.guild.app.equipment.dto.EquipmentDtos.*;
import com.guild.app.equipment.repository.EquipmentRepository;
import com.guild.app.equipment.service.EquipmentService;
import com.guild.app.member.repository.MemberRepository;
import com.guild.app.websocket.WebSocketPublisher;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class EquipmentClientSyncTest {
    @Autowired EquipmentService service;
    @Autowired EquipmentRepository repository;
    @Autowired MemberRepository members;
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @MockitoBean WebSocketPublisher ws;
    long adminId,memberId;
    String nickname,upperA,upperB,ring,weapon;

    static String code(String prefix) {
        var random=new Random(); var text=new StringBuilder(prefix);
        for(int i=0;i<5;i++) text.append((char)('a'+random.nextInt(26)));
        return text.toString();
    }
    long member(Role role,String name) {
        return jdbc.queryForObject("INSERT INTO member(nickname,role,status,profile_complete) VALUES(?,?,'APROVADO',true) RETURNING id",
            Long.class,name,role.name());
    }
    void authenticate(long id) {
        var principal=new MemberPrincipal(members.findById(id).orElseThrow());
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(principal,null,principal.getAuthorities()));
    }
    ImportItem item(String category,String gameCode,String name,List<ImportEffect> effects) {
        return new ImportItem(category,gameCode,name,40,1,effects,42,"0","","11111",0);
    }
    @BeforeEach void setup() {
        adminId=member(Role.ADMINISTRADOR,"Sync Admin "+UUID.randomUUID());
        nickname="SyncChar"+UUID.randomUUID().toString().substring(0,8);
        memberId=member(Role.MEMBRO,nickname);
        upperA=code("iu"); upperB=code("iu"); ring=code("ii"); weapon=code("iw");
        authenticate(adminId);
        var one=List.of(new ImportEffect(15,new BigDecimal("0.08")));
        service.importCatalog(new ImportRequest("b".repeat(64),List.of(
            item("UPPER",upperA,"Client Upper A",one),item("UPPER",upperB,"Client Upper B",one),
            item("RING",ring,"Client Ring [7days",List.of(new ImportEffect(15,new BigDecimal("0.05")),new ImportEffect(16,new BigDecimal("0.05")))),
            item("WEAPON",weapon,"Intense Client Blade",one)),List.of()));
        SecurityContextHolder.clearContext();
    }
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }
    ClientEquipment report(ReportedSlot... slots) { return new ClientEquipment(nickname.toLowerCase(),List.of(slots)); }
    CurrentSlot slot(Slot slot) { return repository.slot(memberId,slot); }
    int audits() {
        return jdbc.queryForObject("SELECT count(*) FROM audit_log WHERE payload->>'action'='CLIENT_SYNC' AND target_id=?",Integer.class,memberId);
    }

    @Test void syncEquipsReportedItemsAsGameClientRecordsAndIsIdempotent() {
        var result=service.syncFromClient(report(new ReportedSlot(Slot.Upper,upperA),new ReportedSlot(Slot.Ring1,ring)));
        assertEquals(List.of("Upper","Ring1"),result.get("changed"));
        var upper=slot(Slot.Upper).assignment();
        assertEquals(upperA,upper.gameCode()); assertEquals(Origin.GAME_CLIENT,upper.origin());
        assertEquals(memberId,upper.actorId()); assertEquals(LocalDate.now(java.time.ZoneId.of("America/Sao_Paulo")),upper.occurredOn());
        assertEquals("15:0.08",upper.effect().key());
        // Modelo com mais de um efeito possível: a administração confirma depois.
        assertEquals("client:unverified",slot(Slot.Ring1).assignment().effect().key());
        // Um envio com várias trocas gera um único log, com todas as posições.
        assertEquals(1,audits());
        assertEquals("[\"Upper\", \"Ring1\"]",jdbc.queryForObject(
            "SELECT payload->>'slots' FROM audit_log WHERE payload->>'action'='CLIENT_SYNC' AND target_id=?",String.class,memberId));
        long version=slot(Slot.Upper).version();
        assertEquals(List.of(),service.syncFromClient(report(new ReportedSlot(Slot.Upper,upperA),new ReportedSlot(Slot.Ring1,ring))).get("changed"));
        assertEquals(version,slot(Slot.Upper).version()); assertEquals(1,audits());
    }
    @Test void swappingBackReusesThePreviousRecordInsteadOfDuplicatingHistory() {
        service.syncFromClient(report(new ReportedSlot(Slot.Upper,upperA)));
        long first=slot(Slot.Upper).assignment().id();
        service.syncFromClient(report(new ReportedSlot(Slot.Upper,upperB)));
        service.syncFromClient(report(new ReportedSlot(Slot.Upper,upperA)));
        assertEquals(first,slot(Slot.Upper).assignment().id());
        assertEquals(2,jdbc.queryForObject("SELECT count(*) FROM equipment_assignment WHERE member_id=?",Integer.class,memberId));
        // Voltar para um item que o membro já tinha (ex.: arma de correr e de bater) não gera log,
        // mas o quadro ainda é avisado da troca.
        assertEquals(2,audits());
        verify(ws,times(3)).publishEquipmentChanged(); // 2 pelos logs + 1 direto na troca sem log
    }
    @Test void deliveryOnlyRecordsAreNeverReusedAsSynchronizedEquipment() {
        authenticate(adminId);
        long upperCatalog=service.catalog("UPPER",upperA,0,10).items().getFirst().id();
        var delivery=service.operate(new Operation(UUID.randomUUID(),Action.CREATE,memberId,Slot.Upper,0L,null,upperCatalog,"15:0.08",
            Origin.GUILD_DISTRIBUTION,LocalDate.now(java.time.ZoneId.of("America/Sao_Paulo")),false,null,null,null,null,BigDecimal.ONE));
        assertTrue(delivery.deliveryOnly());
        SecurityContextHolder.clearContext();
        service.syncFromClient(report(new ReportedSlot(Slot.Upper,upperA)));
        var current=slot(Slot.Upper).assignment();
        assertNotEquals(delivery.id(),current.id());
        assertEquals(Origin.GAME_CLIENT,current.origin());
        assertFalse(current.deliveryOnly());
        var kept=repository.assignment(delivery.id());
        assertTrue(kept.deliveryOnly()); assertEquals("ACTIVE",kept.status());
    }
    @Test void emptySlotClearsAndOmittedSlotsKeepManualRecords() {
        authenticate(adminId);
        var manual=service.operate(new Operation(UUID.randomUUID(),Action.CREATE,memberId,Slot.Weapon2,0L,null,
            service.catalog("WEAPON",weapon,0,10).items().getFirst().id(),"15:0.08",Origin.GUILD_DISTRIBUTION,LocalDate.now(java.time.ZoneId.of("America/Sao_Paulo")),true,null,null,null));
        SecurityContextHolder.clearContext();
        service.syncFromClient(report(new ReportedSlot(Slot.Upper,upperA)));
        service.syncFromClient(report(new ReportedSlot(Slot.Upper,null)));
        assertNull(slot(Slot.Upper).assignment());
        assertEquals(1,audits()); // esvaziar a posição não gera log
        assertEquals(manual.id(),slot(Slot.Weapon2).assignment().id());
        assertEquals("ACTIVE",repository.assignment(manual.id()).status());
    }
    @Test void unknownCodesAreReportedWithoutChangingTheSlot() {
        service.syncFromClient(report(new ReportedSlot(Slot.Upper,upperA)));
        var result=service.syncFromClient(report(new ReportedSlot(Slot.Upper,"iuzzzzz")));
        assertEquals(List.of("Upper:iuzzzzz"),result.get("unknown"));
        assertEquals(upperA,slot(Slot.Upper).assignment().gameCode());
        // Código de outra categoria também não ocupa a posição.
        assertEquals(List.of("Ring1:"+upperB),service.syncFromClient(report(new ReportedSlot(Slot.Ring1,upperB))).get("unknown"));
    }
    @Test void invalidReportsAreRejected() {
        assertThrows(AppException.class,()->service.syncFromClient(report(new ReportedSlot(Slot.Weapon2,weapon))));
        assertThrows(AppException.class,()->service.syncFromClient(report(new ReportedSlot(Slot.Upper,upperA),new ReportedSlot(Slot.Upper,upperB))));
        assertNull(slot(Slot.Upper).assignment());
    }
    @Test void membersPendingApprovalAreNotSynchronized() {
        jdbc.update("UPDATE member SET status='PENDENTE' WHERE id=?",memberId);
        assertThrows(AppException.class,()->service.syncFromClient(report(new ReportedSlot(Slot.Upper,upperA))));
    }
    @Test void ingestEndpointIsPublicAndValidatesTheBody() throws Exception {
        mvc.perform(post("/api/equipment-status/ingest").contentType("application/json")
            .content(json.writeValueAsString(report(new ReportedSlot(Slot.Upper,upperA))))).andExpect(status().isOk());
        assertEquals(upperA,slot(Slot.Upper).assignment().gameCode());
        mvc.perform(post("/api/equipment-status/ingest").contentType("application/json")
            .content(json.writeValueAsString(new ClientEquipment("Ninguem"+UUID.randomUUID().toString().substring(0,8),
                List.of(new ReportedSlot(Slot.Upper,upperA)))))).andExpect(status().isNotFound());
        mvc.perform(post("/api/equipment-status/ingest").contentType("application/json")
            .content("{\"character\":\""+nickname+"\",\"slots\":[{\"slot\":\"Upper\",\"code\":\"DROP TABLE\"}]}")).andExpect(status().isBadRequest());
    }
    @Test void manualOperationsCannotForgeTheGameOrigin() {
        service.syncFromClient(report(new ReportedSlot(Slot.Upper,upperA)));
        var synced=slot(Slot.Upper);
        authenticate(adminId);
        long catalogId=synced.assignment().catalogId();
        assertThrows(AppException.class,()->service.operate(new Operation(UUID.randomUUID(),Action.CREATE,memberId,Slot.Lower,0L,null,
            catalogId,"15:0.08",Origin.GAME_CLIENT,LocalDate.now(java.time.ZoneId.of("America/Sao_Paulo")),true,null,null,null)));
        // A administração audita: corrige o registro do jogo mantendo a origem.
        var corrected=service.operate(new Operation(UUID.randomUUID(),Action.CORRECT,memberId,Slot.Upper,synced.version(),
            synced.assignment().id(),catalogId,"15:0.08",Origin.GAME_CLIENT,LocalDate.now(java.time.ZoneId.of("America/Sao_Paulo")),true,null,null,"Conferido pela administração"));
        assertEquals(Origin.GAME_CLIENT,corrected.origin());
        assertEquals("CORRECTED",repository.assignment(synced.assignment().id()).status());
    }
    @Test void sharedCharacterSyncsEveryAccountWithThatNick() {
        long sharedId=member(Role.MEMBRO,nickname.toUpperCase());
        long deletedId=jdbc.queryForObject("INSERT INTO member(nickname,role,status,profile_complete) VALUES(?,'MEMBRO','EXCLUIDO',true) RETURNING id",
            Long.class,nickname);
        var result=service.syncFromClient(report(new ReportedSlot(Slot.Upper,upperA)));
        assertEquals(List.of("Upper"),result.get("changed"));
        assertEquals(upperA,slot(Slot.Upper).assignment().gameCode());
        assertEquals(upperA,repository.slot(sharedId,Slot.Upper).assignment().gameCode());
        assertNull(repository.slot(deletedId,Slot.Upper).assignment());
    }
}
