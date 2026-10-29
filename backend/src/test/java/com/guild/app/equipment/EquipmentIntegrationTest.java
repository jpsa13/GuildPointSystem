package com.guild.app.equipment;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.guild.app.auth.security.MemberPrincipal;
import com.guild.app.common.enums.*;
import com.guild.app.common.exception.AppException;
import com.guild.app.equipment.dto.EquipmentDtos.*;
import com.guild.app.equipment.repository.EquipmentRepository;
import com.guild.app.equipment.service.EquipmentService;
import com.guild.app.member.repository.MemberRepository;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class EquipmentIntegrationTest {
    @Autowired EquipmentService service;
    @Autowired EquipmentRepository repository;
    @Autowired com.guild.app.log.service.LogService logService;
    @Autowired MemberRepository members;
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired jakarta.persistence.EntityManager entityManager;
    long actorId,memberId,catalogId;
    String code;

    long member(Role role,MemberStatus status,boolean complete) {
        return jdbc.queryForObject("INSERT INTO member(nickname,role,status,profile_complete) VALUES(?,?,?,?) RETURNING id",
            Long.class,"Equip Test "+UUID.randomUUID(),role.name(),status.name(),complete);
    }
    UsernamePasswordAuthenticationToken authenticationFor(long id) {
        var principal=new MemberPrincipal(members.findById(id).orElseThrow());
        return new UsernamePasswordAuthenticationToken(principal,null,principal.getAuthorities());
    }
    void authenticate(long id) { SecurityContextHolder.getContext().setAuthentication(authenticationFor(id)); }
    @BeforeEach void setup() {
        actorId=member(Role.ADMINISTRADOR,MemberStatus.APROVADO,true);
        memberId=member(Role.MEMBRO,MemberStatus.APROVADO,true);
        authenticate(actorId);
        code="eq"+UUID.randomUUID().toString().replace("-","");
        service.importCatalog(importRequest("Teste EDF",List.of(new ImportEffect(15,new BigDecimal("0.08")))));
        catalogId=service.catalog("WEAPON",code,0,10).items().getFirst().id();
    }
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }
    ImportRequest importRequest(String name,List<ImportEffect> effects) {
        return new ImportRequest("a".repeat(64),List.of(new ImportItem("WEAPON",code,"Intense "+name,40,1,effects,42,"0","","11111",0)),List.of());
    }
    Operation create(Slot slot,long version,boolean equip,String effect) {
        return new Operation(UUID.randomUUID(),Action.CREATE,memberId,slot,version,null,catalogId,effect,
            Origin.GUILD_DISTRIBUTION,LocalDate.now(java.time.ZoneId.of("America/Sao_Paulo")),equip,null,null,null);
    }
    Operation change(Action action,Assignment record,long version,Long replacement,Restoration restoration) {
        return new Operation(UUID.randomUUID(),action,memberId,record.slot(),version,record.id(),catalogId,"15:0.08",
            Origin.INITIAL,LocalDate.now(java.time.ZoneId.of("America/Sao_Paulo")),false,replacement,restoration,"Correção de teste");
    }
    CurrentSlot slot(Slot slot) { return repository.slot(memberId,slot); }
    SlotEdit remove(Slot... slots) {
        return new SlotEdit(UUID.randomUUID(),memberId,Arrays.stream(slots).map(s->new SlotVersion(s,slot(s).version())).toList(),null);
    }
    SlotEdit reverse(SlotEditResult result) {
        return new SlotEdit(UUID.randomUUID(),result.memberId(),result.slots().stream().map(s->new SlotVersion(s.slot(),s.version())).toList(),result.operationId());
    }

    Operation delivery(UUID id,int quantity,long version,boolean equip) {
        return new Operation(id,Action.CREATE,memberId,Slot.Weapon,version,null,catalogId,"15:0.08",
            Origin.GUILD_DISTRIBUTION,LocalDate.now(java.time.ZoneId.of("America/Sao_Paulo")),equip,null,null,null,null,BigDecimal.valueOf(quantity));
    }
    @Test void relicsPersistAndReplayWithoutChangingSlotsScoreOrPublicAudit() throws Exception {
        var before=service.board().stream().filter(m->m.memberId()==memberId).findFirst().orElseThrow();
        authenticate(actorId);
        assertEquals(List.of(),service.relics(memberId));
        assertEquals(List.of(0),service.setRelic(memberId,0,new RelicState(true)));
        assertEquals(List.of(0),service.setRelic(memberId,0,new RelicState(true)));
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM audit_log WHERE target_id=? AND payload->>'action'='RELIC'",Integer.class,memberId));
        assertEquals(actorId,jdbc.queryForObject("SELECT actor_id FROM audit_log WHERE target_id=? AND payload->>'action'='RELIC'",Long.class,memberId));
        var after=service.board().stream().filter(m->m.memberId()==memberId).findFirst().orElseThrow();
        assertEquals(before.slots(),after.slots());
        assertEquals(before.gearScore(),after.gearScore());
        mvc.perform(get("/api/equipment/members/"+memberId+"/relics").with(authentication(authenticationFor(actorId))))
            .andExpect(status().isOk()).andExpect(jsonPath("$[0]").value(0));
        authenticate(actorId);
        assertEquals(List.of(),service.setRelic(memberId,0,new RelicState(false)));
        assertEquals(List.of(),service.relics(memberId));
        assertTrue(service.history(memberId).isEmpty());
    }
    @Test void relicEndpointsEnforceOwnershipRolesAndValidIdentifiers() throws Exception {
        mvc.perform(put("/api/equipment/members/"+actorId+"/relics/0").with(authentication(authenticationFor(memberId)))
            .contentType("application/json").content("{\"active\":true}")).andExpect(status().isForbidden());
        for(boolean active:List.of(true,false))
            mvc.perform(put("/api/equipment/members/"+memberId+"/relics/0").with(authentication(authenticationFor(memberId)))
                .contentType("application/json").content("{\"active\":"+active+"}")).andExpect(status().isForbidden());
        for(int id:List.of(-1,120))
            mvc.perform(put("/api/equipment/members/"+memberId+"/relics/"+id).with(authentication(authenticationFor(actorId)))
                .contentType("application/json").content("{\"active\":true}")).andExpect(status().isBadRequest());
        mvc.perform(put("/api/equipment/members/"+memberId+"/relics/0").with(authentication(authenticationFor(actorId)))
            .contentType("application/json").content("{}")).andExpect(status().isBadRequest());
        mvc.perform(put("/api/equipment/members/"+memberId+"/relics/119").with(authentication(authenticationFor(actorId)))
            .contentType("application/json").content("{\"active\":true}")).andExpect(status().isOk()).andExpect(jsonPath("$[0]").value(119));
        mvc.perform(get("/api/equipment/members/"+memberId+"/relics").with(authentication(authenticationFor(memberId))))
            .andExpect(status().isOk()).andExpect(jsonPath("$[0]").value(119));
        SecurityContextHolder.clearContext();
        mvc.perform(get("/api/equipment/members/"+memberId+"/relics")
            .with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.anonymous())).andExpect(status().isUnauthorized());
    }
    @Test void deliveryQuantityCreatesIndependentUnitsWithoutEquippingAndReplaysExactlyOnce() {
        var equipped=service.operate(create(Slot.Weapon,0,true,"15:0.08"));
        var scoreBefore=service.board().stream().filter(m->m.memberId()==memberId).findFirst().orElseThrow().gearScore();
        var request=delivery(UUID.randomUUID(),3,1,false);
        var receipt=service.operate(request);
        assertEquals(4,service.history(memberId).size());
        assertFalse(equipped.deliveryOnly());
        assertTrue(receipt.deliveryOnly());
        assertEquals(3,service.history(memberId).stream().filter(r->Boolean.TRUE.equals(r.deliveryOnly())).count());
        assertEquals(scoreBefore,service.board().stream().filter(m->m.memberId()==memberId).findFirst().orElseThrow().gearScore());
        assertEquals(equipped.id(),slot(Slot.Weapon).assignment().id()); assertEquals(1,slot(Slot.Weapon).version());
        assertEquals(receipt.id(),service.operate(request).id());
        assertEquals(4,service.history(memberId).size());
        assertThrows(AppException.class,()->service.operate(delivery(request.operationId(),4,1,false)));
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM audit_log WHERE payload->>'operationId'=?",Integer.class,request.operationId().toString()));
        assertEquals(3,jdbc.queryForObject("SELECT jsonb_array_length(payload->'assignmentIds') FROM audit_log WHERE payload->>'operationId'=?",Integer.class,request.operationId().toString()));
        service.operate(change(Action.CANCEL,receipt,1,null,null));
        assertEquals(2,service.history(memberId).stream().filter(r->r.id()!=equipped.id() && r.status().equals("ACTIVE")).count());
    }
    @Test void quantityIsValidatedAndReservedForAdminDeliveries() throws Exception {
        for(int quantity:new int[]{-1,0,101}) assertThrows(AppException.class,()->service.operate(delivery(UUID.randomUUID(),quantity,0,false)));
        assertThrows(AppException.class,()->service.operate(delivery(UUID.randomUUID(),2,0,true)));
        authenticate(memberId);
        assertThrows(AppException.class,()->service.operate(delivery(UUID.randomUUID(),2,0,false)));
        authenticate(actorId);
        var body=json.valueToTree(delivery(UUID.randomUUID(),2,0,false));
        ((com.fasterxml.jackson.databind.node.ObjectNode)body).put("quantity",new BigDecimal("1.5"));
        mvc.perform(post("/api/equipment/operations").with(authentication(authenticationFor(actorId)))
            .contentType("application/json").content(json.writeValueAsString(body))).andExpect(status().isBadRequest());
        authenticate(actorId);
        assertTrue(service.history(memberId).isEmpty());
    }
    @Test void deliveriesIgnoreSlotChangesAndStayClassifiedAfterCorrection() throws Exception {
        var receipt=service.operate(delivery(UUID.randomUUID(),1,99,false));
        assertNull(slot(Slot.Weapon).assignment());
        assertEquals(0,slot(Slot.Weapon).version());
        var corrected=service.operate(new Operation(UUID.randomUUID(),Action.CORRECT,memberId,Slot.Weapon,0L,receipt.id(),
            catalogId,"15:0.08",Origin.GUILD_DISTRIBUTION,LocalDate.now(java.time.ZoneId.of("America/Sao_Paulo")),false,null,null,"Corrigir entrega"));
        assertTrue(corrected.deliveryOnly());
        assertNull(slot(Slot.Weapon).assignment());
        assertEquals("CORRECTED",repository.assignment(receipt.id()).status());
        var ordinary=service.operate(create(Slot.Weapon,0,true,"15:0.08"));
        jdbc.update("UPDATE equipment_assignment SET delivery_only=false WHERE member_id=?",memberId);
        try(var in=new org.springframework.core.io.ClassPathResource("db/migration/V73__equipment_delivery_ledger.sql").getInputStream()) {
            var migration=new String(in.readAllBytes(),java.nio.charset.StandardCharsets.UTF_8);
            jdbc.execute(migration.substring(migration.indexOf("WITH RECURSIVE")));
        }
        assertTrue(repository.assignment(receipt.id()).deliveryOnly());
        assertTrue(repository.assignment(corrected.id()).deliveryOnly());
        assertFalse(repository.assignment(ordinary.id()).deliveryOnly());
        mvc.perform(get("/api/equipment/members/"+memberId+"/history").with(authentication(authenticationFor(memberId))))
            .andExpect(status().isForbidden());
    }
    @Test
    @Transactional(propagation=Propagation.NOT_SUPPORTED)
    void aFailureInTheSecondDeliveryUnitRollsBackTheWholeBatch() {
        String name="equipment_quantity_test_"+UUID.randomUUID().toString().replace("-","");
        var request=delivery(UUID.randomUUID(),3,0,false);
        int before=jdbc.queryForObject("SELECT count(*) FROM equipment_instance WHERE catalog_item_id=?",Integer.class,catalogId);
        jdbc.execute("CREATE FUNCTION "+name+"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.member_id="+memberId+
            " AND EXISTS(SELECT 1 FROM equipment_assignment WHERE member_id="+memberId+") THEN RAISE EXCEPTION 'Simulated second unit failure'; END IF; RETURN NEW; END $$");
        try {
            jdbc.execute("CREATE TRIGGER "+name+" BEFORE INSERT ON equipment_assignment FOR EACH ROW EXECUTE FUNCTION "+name+"()");
            assertThrows(org.springframework.dao.DataAccessException.class,()->service.operate(request));
            assertTrue(service.history(memberId).isEmpty());
            assertEquals(before,jdbc.queryForObject("SELECT count(*) FROM equipment_instance WHERE catalog_item_id=?",Integer.class,catalogId));
            assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM equipment_operation WHERE id=?",Integer.class,request.operationId()));
        } finally {
            jdbc.execute("DROP TRIGGER IF EXISTS "+name+" ON equipment_assignment");
            jdbc.execute("DROP FUNCTION IF EXISTS "+name+"()");
        }
    }

    @Test void reviewsArePrivateIdempotentAndExpireAfter72Hours() {
        var input=new ReviewRequest(UUID.randomUUID(),memberId);
        var request=service.requestReview(input);
        assertEquals("PENDING",request.status());
        assertEquals(72,java.time.Duration.between(request.requestedAt(),request.dueAt()).toHours());
        assertEquals(request,service.requestReview(input));
        assertEquals(request,service.requestReview(new ReviewRequest(UUID.randomUUID(),memberId)));
        assertThrows(AppException.class,()->service.confirmReview(request.id()));
        authenticate(memberId);
        assertEquals(List.of(request),service.reviews());
        assertThrows(AppException.class,()->service.requestReview(new ReviewRequest(UUID.randomUUID(),actorId)));
        jdbc.update("UPDATE equipment_review_request SET requested_at=now()-interval '73 hours',due_at=now()-interval '1 hour' WHERE id=?",request.id());
        assertTrue(service.reviews().getFirst().overdue());
        assertEquals("OVERDUE",service.reviews().getFirst().status());
        service.operate(create(Slot.Weapon,0,true,"15:0.08"));
        assertTrue(service.reviews().getFirst().overdue());
        var confirmed=service.confirmReview(request.id());
        assertEquals("CONFIRMED",confirmed.status()); assertFalse(confirmed.overdue());
        assertEquals(confirmed,service.confirmReview(request.id()));
        assertEquals(2,jdbc.queryForObject("SELECT count(*) FROM audit_log WHERE payload->>'requestId'=?",Integer.class,request.id().toString()));
        authenticate(actorId);
        assertNotEquals(request.id(),service.requestReview(new ReviewRequest(UUID.randomUUID(),memberId)).id());
    }

    @Test void clearUndoAndRedoAreAtomicPreserveHistoryAndReplayWithoutDuplicates() {
        var first=service.operate(create(Slot.Weapon,0,true,"15:0.08"));
        var second=service.operate(create(Slot.Weapon2,0,true,"15:0.08"));
        var request=remove(Slot.Weapon,Slot.Weapon2);
        var cleared=service.editSlots(request);
        assertTrue(cleared.slots().stream().allMatch(s->s.assignment()==null && s.version()==2));
        assertEquals(cleared,service.editSlots(request));
        assertEquals(2,slot(Slot.Weapon).version());
        assertEquals(2,service.history(memberId).size());
        assertTrue(service.history(memberId).stream().allMatch(s->s.status().equals("ACTIVE")));
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM audit_log WHERE payload->>'operationId'=?",Integer.class,request.operationId().toString()));
        var restored=service.editSlots(reverse(cleared));
        assertEquals(first.id(),slot(Slot.Weapon).assignment().id());
        assertEquals(second.id(),slot(Slot.Weapon2).assignment().id());
        var redone=service.editSlots(reverse(restored));
        assertTrue(redone.slots().stream().allMatch(s->s.assignment()==null && s.version()==4));
        service.editSlots(reverse(redone));
        assertEquals(first.id(),slot(Slot.Weapon).assignment().id());
    }

    @Test void staleOrDuplicateSlotEditsNeverPartiallyClearEquipment() throws Exception {
        var first=service.operate(create(Slot.Weapon,0,true,"15:0.08"));
        var second=service.operate(create(Slot.Weapon2,0,true,"15:0.08"));
        assertThrows(AppException.class,()->service.editSlots(new SlotEdit(UUID.randomUUID(),memberId,List.of(new SlotVersion(Slot.Weapon,1L),new SlotVersion(Slot.Weapon2,0L)),null)));
        assertEquals(first.id(),slot(Slot.Weapon).assignment().id());
        assertEquals(second.id(),slot(Slot.Weapon2).assignment().id());
        assertThrows(AppException.class,()->service.editSlots(new SlotEdit(UUID.randomUUID(),memberId,List.of(new SlotVersion(Slot.Weapon,1L),new SlotVersion(Slot.Weapon,1L)),null)));
        mvc.perform(post("/api/equipment/slots").with(authentication(authenticationFor(actorId))).contentType("application/json")
            .content(json.writeValueAsString(new SlotEdit(UUID.randomUUID(),memberId,List.of(new SlotVersion(Slot.Weapon,-1L)),null)))).andExpect(status().isBadRequest());
    }

    @Test void membersRemoveAndUndoOnlyOwnEquipmentAndNeverReceivePrivateAuditFields() throws Exception {
        service.operate(create(Slot.Weapon,0,true,"15:0.08"));
        authenticate(memberId);
        var request=remove(Slot.Weapon);
        var cleared=service.editSlots(request);
        var undo=reverse(cleared);
        var restored=service.editSlots(undo);
        assertNull(restored.slots().getFirst().assignment().actorId());
        assertNull(restored.slots().getFirst().assignment().actorName());
        assertNull(service.editSlots(undo).slots().getFirst().assignment().createdAt());
        mvc.perform(post("/api/equipment/slots").with(authentication(authenticationFor(memberId))).contentType("application/json")
            .content(json.writeValueAsString(undo))).andExpect(status().isOk()).andExpect(jsonPath("$.slots[0].assignment.actorName").doesNotExist());
        assertThrows(AppException.class,()->service.editSlots(new SlotEdit(UUID.randomUUID(),actorId,List.of(new SlotVersion(Slot.Weapon,0L)),null)));
        authenticate(actorId);
        assertThrows(AppException.class,()->service.editSlots(reverse(restored)));
    }

    @Test void undoDoesNotOverwriteLaterEquipmentAndRejectsChangedRequestsWithSameId() {
        service.operate(create(Slot.Weapon,0,true,"15:0.08"));
        var request=remove(Slot.Weapon);
        var cleared=service.editSlots(request);
        assertThrows(AppException.class,()->service.editSlots(new SlotEdit(request.operationId(),memberId,List.of(new SlotVersion(Slot.Weapon2,0L)),null)));
        var newer=service.operate(create(Slot.Weapon,2,true,"15:0.08"));
        assertThrows(AppException.class,()->service.editSlots(reverse(cleared)));
        assertEquals(newer.id(),slot(Slot.Weapon).assignment().id());
        assertThrows(AppException.class,()->service.editSlots(new SlotEdit(UUID.randomUUID(),memberId,List.of(new SlotVersion(Slot.Weapon,3L)),cleared.operationId())));
        assertEquals(newer.id(),slot(Slot.Weapon).assignment().id());
    }

    @Test void undoValidatesAllOriginalRecordsBeforeRestoringAnySlot() {
        service.operate(create(Slot.Weapon,0,true,"15:0.08"));
        var second=service.operate(create(Slot.Weapon2,0,true,"15:0.08"));
        var cleared=service.editSlots(remove(Slot.Weapon,Slot.Weapon2));
        repository.status(second.id(),"CANCELLED","Registro incorreto",actorId);
        assertThrows(AppException.class,()->service.editSlots(reverse(cleared)));
        assertNull(slot(Slot.Weapon).assignment());
        assertNull(slot(Slot.Weapon2).assignment());
        assertEquals(2,slot(Slot.Weapon).version());
    }

    @Test void boardReadsCurrentProfileLevelForAdministratorsAndMembers() throws Exception {
        jdbc.update("UPDATE member SET level=43 WHERE id=?",memberId);
        assertEquals(43,service.board().stream().filter(m->m.memberId()==memberId).findFirst().orElseThrow().level());
        jdbc.update("UPDATE member SET level=47 WHERE id=?",memberId);
        authenticate(memberId);
        assertEquals(47,service.board().stream().filter(m->m.memberId()==memberId).findFirst().orElseThrow().level());
        var response=mvc.perform(get("/api/equipment").with(authentication(authenticationFor(memberId))))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        var found=false;
        for(var row:json.readTree(response)) if(row.get("memberId").asLong()==memberId) {
            assertEquals(47,row.get("level").asInt()); found=true;
        }
        assertTrue(found);
    }

    @Test void boardIncludesLatestCharacterProgressAndProfileClassForMembers() throws Exception {
        long classId=jdbc.queryForObject("SELECT id FROM character_class ORDER BY id LIMIT 1",Long.class);
        String className=jdbc.queryForObject("SELECT name FROM character_class WHERE id=?",String.class,classId);
        String classImageUrl=jdbc.queryForObject("SELECT image_url FROM character_class WHERE id=?",String.class,classId);
        jdbc.update("UPDATE member SET class_id=?,level=43 WHERE id=?",classId,memberId);
        var fallback=service.board().stream().filter(m->m.memberId()==memberId).findFirst().orElseThrow();
        assertNull(fallback.expPercent());
        assertEquals(className,fallback.className());
        jdbc.update("""
            INSERT INTO character_status(member_id,gid,character_name,level,exp_percent,hp,hp_max,fp,fp_max,sp,sp_max,updated_at)
            VALUES (?,1,'Old character',60,99,1,1,1,1,1,1,now()-interval '1 hour'),
                   (?,2,'Current character',45,12.5,1,1,1,1,1,1,now())
            """,memberId,memberId);
        for(long viewer:List.of(actorId,memberId)) {
            var response=mvc.perform(get("/api/equipment").with(authentication(authenticationFor(viewer))))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
            var row=json.readTree(response).findValues("memberId");
            assertFalse(row.isEmpty());
            for(var entry:json.readTree(response)) if(entry.get("memberId").asLong()==memberId) {
                assertEquals(45,entry.get("level").asInt());
                assertEquals(12.5,entry.get("expPercent").asDouble());
                assertEquals(classId,entry.get("classId").asLong());
                assertEquals(className,entry.get("className").asText());
                assertEquals(classImageUrl,entry.get("classImageUrl").asText());
            }
        }
    }

    Operation repass(Slot slot,long version,long target,Slot targetSlot,long targetVersion,boolean replace) {
        return new Operation(UUID.randomUUID(),Action.CREATE,memberId,slot,version,null,catalogId,"15:0.08",
            Origin.GUILD_DISTRIBUTION,LocalDate.now(java.time.ZoneId.of("America/Sao_Paulo")),true,null,null,null,new Transfer(target,targetSlot,targetVersion,replace));
    }

    Operation send(long target,long targetVersion,boolean replace) {
        return new Operation(UUID.randomUUID(),Action.TRANSFER,memberId,Slot.Weapon,1L,null,null,null,
            null,null,false,null,null,null,new Transfer(target,null,targetVersion,replace));
    }

    Operation sendPrevious(Assignment source,long version,long target,long targetVersion,boolean replace) {
        return new Operation(UUID.randomUUID(),Action.TRANSFER,memberId,source.slot(),version,source.id(),null,null,
            null,null,false,null,null,null,new Transfer(target,null,targetVersion,replace));
    }

    @Test void previousTransferPreservesCurrentEquipmentAndCannotBeRepeatedWithAnotherOperation() {
        var old=service.operate(create(Slot.Weapon,0,true,"15:0.08"));
        var upgraded=service.operate(create(Slot.Weapon,1,true,"15:0.08"));
        long target=member(Role.MEMBRO,MemberStatus.APROVADO,true);
        var operation=sendPrevious(old,2,target,0,false);
        var sent=service.operate(operation);
        assertEquals("TRANSFERRED",sent.status());
        assertEquals(upgraded.id(),slot(Slot.Weapon).assignment().id());
        assertEquals(2,slot(Slot.Weapon).version());
        var received=repository.slot(target,Slot.Weapon).assignment();
        assertEquals(old.name(),received.name());
        assertEquals(old.effect(),received.effect());
        assertEquals(old.sourceHash(),received.sourceHash());
        assertEquals(sent,service.operate(operation));
        assertEquals(1,repository.history(target).size());
        assertThrows(AppException.class,()->service.operate(sendPrevious(old,2,target,1,true)));
        assertEquals(2,jdbc.queryForObject("SELECT count(*) FROM audit_log WHERE payload->>'operationId'=?",Integer.class,operation.operationId().toString()));
        assertThrows(AppException.class,()->service.operate(change(Action.EQUIP,old,2,null,null)));
    }

    @Test void previousTransferSupportsRemovedItemsAndChecksRecipientBeforeChangingAnything() {
        var old=service.operate(create(Slot.Weapon,0,true,"15:0.08"));
        var removal=service.editSlots(remove(Slot.Weapon));
        long target=member(Role.MEMBRO,MemberStatus.APROVADO,true);
        var existing=service.operate(new Operation(UUID.randomUUID(),Action.CREATE,target,Slot.Weapon,0L,null,catalogId,"15:0.08",
            Origin.INITIAL,LocalDate.now(java.time.ZoneId.of("America/Sao_Paulo")),true,null,null,null));
        assertThrows(AppException.class,()->service.operate(sendPrevious(old,2,target,0,true)));
        assertThrows(AppException.class,()->service.operate(sendPrevious(old,2,target,1,false)));
        assertEquals("ACTIVE",repository.assignment(old.id()).status());
        assertEquals(existing.id(),repository.slot(target,Slot.Weapon).assignment().id());
        service.operate(sendPrevious(old,2,target,1,true));
        assertNull(slot(Slot.Weapon).assignment());
        assertEquals(2,slot(Slot.Weapon).version());
        assertEquals("ACTIVE",repository.assignment(existing.id()).status());
        assertFalse(repository.isEquipped(existing.id()));
        assertThrows(AppException.class,()->service.editSlots(reverse(removal)));
    }

    @Test void previousTransferRejectsEquippedDeliveryCancelledForeignAndUnauthorizedRecords() {
        var old=service.operate(create(Slot.Weapon,0,true,"15:0.08"));
        long target=member(Role.MEMBRO,MemberStatus.APROVADO,true);
        assertThrows(AppException.class,()->service.operate(sendPrevious(old,1,target,0,false)));
        service.operate(create(Slot.Weapon,1,true,"15:0.08"));
        assertThrows(AppException.class,()->service.operate(sendPrevious(old,1,target,0,false)));
        var delivery=service.operate(delivery(UUID.randomUUID(),1,2,false));
        assertThrows(AppException.class,()->service.operate(sendPrevious(delivery,2,target,0,false)));
        authenticate(memberId);
        assertThrows(AppException.class,()->service.operate(sendPrevious(old,2,target,0,false)));
        authenticate(actorId);
        var foreign=service.operate(new Operation(UUID.randomUUID(),Action.CREATE,target,Slot.Weapon,0L,null,catalogId,"15:0.08",
            Origin.INITIAL,LocalDate.now(java.time.ZoneId.of("America/Sao_Paulo")),false,null,null,null));
        assertThrows(AppException.class,()->service.operate(sendPrevious(foreign,2,target,0,false)));
        service.operate(change(Action.CANCEL,old,2,null,null));
        assertThrows(AppException.class,()->service.operate(sendPrevious(old,2,target,0,false)));
        assertNull(repository.slot(target,Slot.Weapon).assignment());
    }

    @Test void directTransferAcceptsEmptyDestinationWithoutCatalogSelectionAndIsIdempotent() {
        var old=service.operate(create(Slot.Weapon,0,true,"15:0.08"));
        long target=member(Role.MEMBRO,MemberStatus.APROVADO,true);
        var op=send(target,0,false);
        authenticate(memberId);
        assertThrows(AppException.class,()->service.operate(op));
        authenticate(actorId);
        jdbc.update("UPDATE game_lua_item SET edf_source_hash=NULL WHERE id=?",catalogId);
        var sent=service.operate(op);
        assertEquals(old.id(),sent.id());
        assertEquals("TRANSFERRED",sent.status());
        assertNull(slot(Slot.Weapon).assignment());
        assertEquals(2,slot(Slot.Weapon).version());
        var received=repository.slot(target,Slot.Weapon).assignment();
        assertEquals(old.name(),received.name());
        assertEquals(old.effect(),received.effect());
        assertEquals(old.iconId(),received.iconId());
        assertEquals(actorId,received.actorId());
        assertEquals(sent,service.operate(op));
        assertEquals(1,repository.history(target).size());
        assertEquals(2,slot(Slot.Weapon).version());
        assertEquals(2,jdbc.queryForObject("SELECT count(*) FROM audit_log WHERE payload->>'operationId'=?",Integer.class,op.operationId().toString()));
        assertThrows(AppException.class,()->service.operate(send(target,1,true)));
    }

    @Test void directTransferChecksRecipientConsentAndVersionBeforeEmptyingSource() {
        var old=service.operate(create(Slot.Weapon,0,true,"15:0.08"));
        long target=member(Role.MEMBRO,MemberStatus.APROVADO,true);
        var existing=service.operate(new Operation(UUID.randomUUID(),Action.CREATE,target,Slot.Weapon,0L,null,catalogId,"15:0.08",
            Origin.INITIAL,LocalDate.now(java.time.ZoneId.of("America/Sao_Paulo")),true,null,null,null));
        assertThrows(AppException.class,()->service.operate(send(target,0,true)));
        assertThrows(AppException.class,()->service.operate(send(target,1,false)));
        assertThrows(AppException.class,()->service.operate(send(memberId,1,true)));
        assertThrows(AppException.class,()->service.operate(new Operation(UUID.randomUUID(),Action.TRANSFER,memberId,Slot.Weapon,1L,
            null,null,null,null,null,false,null,null,null)));
        assertEquals(old.id(),slot(Slot.Weapon).assignment().id());
        assertEquals(existing.id(),repository.slot(target,Slot.Weapon).assignment().id());
        service.operate(send(target,1,true));
        assertNull(slot(Slot.Weapon).assignment());
        assertEquals("ACTIVE",repository.assignment(existing.id()).status());
        assertEquals(2,repository.history(target).size());
    }

    @Test void transferKeepsOriginalSnapshotAndLogsBothMembersWithoutDuplicatingOnRetry() {
        var old=service.operate(create(Slot.Weapon2,0,true,"15:0.08"));
        long target=member(Role.MEMBRO,MemberStatus.APROVADO,true);
        jdbc.update("UPDATE game_lua_item SET edf_name='Intense Novo modelo',edf_icon_id=77 WHERE id=?",catalogId);
        var operation=repass(Slot.Weapon2,1,target,null,0,false);
        var replacement=service.operate(operation);
        var received=repository.slot(target,Slot.Weapon2).assignment();
        assertEquals(replacement.id(),slot(Slot.Weapon2).assignment().id());
        assertNull(repository.slot(target,Slot.Weapon).assignment());
        assertEquals(old.name(),received.name());
        assertEquals(old.effect(),received.effect());
        assertEquals(old.iconId(),received.iconId());
        assertEquals(old.sourceHash(),received.sourceHash());
        assertEquals(actorId,received.actorId());
        assertEquals("TRANSFERRED",repository.assignment(old.id()).status());
        assertTrue(repository.assignment(old.id()).statusReason().contains("#"+received.id()));
        assertEquals(replacement.id(),service.operate(operation).id());
        assertEquals(1,repository.history(target).size());
        assertEquals(2,jdbc.queryForObject("SELECT count(*) FROM audit_log WHERE payload->>'operationId'=?",Integer.class,operation.operationId().toString()));
        assertThrows(AppException.class,()->service.operate(change(Action.EQUIP,old,2,null,null)));
    }

    @Test void occupiedRecipientRequiresConsentAndVersionAndPreservesDisplacedRecord() {
        var old=service.operate(create(Slot.Weapon,0,true,"15:0.08"));
        long target=member(Role.MEMBRO,MemberStatus.APROVADO,true);
        var existing=service.operate(new Operation(UUID.randomUUID(),Action.CREATE,target,Slot.Weapon,0L,null,catalogId,"15:0.08",
            Origin.INITIAL,LocalDate.now(java.time.ZoneId.of("America/Sao_Paulo")),true,null,null,null));
        assertThrows(AppException.class,()->service.operate(repass(Slot.Weapon,1,target,null,1,false)));
        assertThrows(AppException.class,()->service.operate(repass(Slot.Weapon,1,target,null,0,true)));
        assertEquals(old.id(),slot(Slot.Weapon).assignment().id());
        assertEquals(existing.id(),repository.slot(target,Slot.Weapon).assignment().id());
        assertEquals(1,repository.history(memberId).size());
        service.operate(repass(Slot.Weapon,1,target,null,1,true));
        assertEquals("ACTIVE",repository.assignment(existing.id()).status());
        assertEquals(2,repository.history(target).size());
        assertEquals(old.gameCode(),repository.slot(target,Slot.Weapon).assignment().gameCode());
    }

    @Test void transferRejectsOrdinaryMembersSelfTargetsWrongSlotsAndUnavailableTargets() {
        service.operate(create(Slot.Weapon,0,true,"15:0.08"));
        long target=member(Role.MEMBRO,MemberStatus.APROVADO,true);
        var operation=repass(Slot.Weapon,1,target,null,0,false);
        authenticate(memberId);
        assertThrows(AppException.class,()->service.operate(operation));
        authenticate(actorId);
        assertThrows(AppException.class,()->service.operate(repass(Slot.Weapon,1,memberId,null,0,false)));
        assertThrows(AppException.class,()->service.operate(repass(Slot.Weapon,1,target,Slot.Weapon2,0,false)));
        assertThrows(AppException.class,()->service.operate(repass(Slot.Weapon,1,target,Slot.Helmet,0,false)));
        long incomplete=member(Role.MEMBRO,MemberStatus.APROVADO,false);
        long pending=member(Role.MEMBRO,MemberStatus.PENDENTE,true);
        assertThrows(AppException.class,()->service.operate(repass(Slot.Weapon,1,incomplete,null,0,false)));
        assertThrows(AppException.class,()->service.operate(repass(Slot.Weapon,1,pending,null,0,false)));
        assertEquals(1,repository.history(memberId).size());
        assertNull(repository.slot(target,Slot.Weapon).assignment());
    }

    @Test void ringsAndAmuletsMayChooseEitherSideButNoOtherCategory() {
        long target=member(Role.MEMBRO,MemberStatus.APROVADO,true);
        for(var pair:List.of(List.of(Slot.Ring1,Slot.Ring2),List.of(Slot.Amulet1,Slot.Amulet2))) {
            jdbc.update("UPDATE game_lua_item SET category=?,edf_name='Elemental Test' WHERE id=?",pair.getFirst().category,catalogId);
            service.operate(create(pair.getFirst(),0,true,"15:0.08"));
            assertThrows(AppException.class,()->service.operate(repass(pair.getFirst(),1,target,Slot.Helmet,0,false)));
            service.operate(repass(pair.getFirst(),1,target,pair.getLast(),0,false));
            assertNotNull(repository.slot(target,pair.getLast()).assignment());
            assertNull(repository.slot(target,pair.getFirst()).assignment());
        }
    }

    @Test void searchFiltersCategoryAndGradesButPreservesExistingHistoricalEquipment() {
        var record=service.operate(create(Slot.Weapon,0,true,"15:0.08"));
        jdbc.update("UPDATE game_lua_item SET edf_grade=0 WHERE id=?",catalogId);
        assertTrue(service.catalog("WEAPON",code,0,10).items().isEmpty());
        assertThrows(AppException.class,()->service.operate(create(Slot.Weapon2,0,false,"15:0.08")));
        assertEquals(record.id(),slot(Slot.Weapon).assignment().id());
        jdbc.update("UPDATE game_lua_item SET edf_grade=2 WHERE id=?",catalogId);
        assertTrue(service.catalog("WEAPON",code,0,10).items().isEmpty());
        jdbc.update("UPDATE game_lua_item SET edf_grade=1 WHERE id=?",catalogId);
        assertEquals(catalogId,service.catalog("WEAPON",code.toUpperCase(),0,10).items().getFirst().id());
        assertTrue(service.catalog("HELMET",code,0,10).items().isEmpty());
    }

    @Test void onlyGradesOneAndThreeAreSelectableWhileOtherGradesKeepTheirHistory() {
        var old=service.operate(create(Slot.Weapon,0,true,"15:0.08"));
        for (int grade : new int[]{0,2,4,5,6,7,8,9,10,255}) {
            jdbc.update("UPDATE game_lua_item SET edf_grade=? WHERE id=?",grade,catalogId);
            assertTrue(service.catalog("WEAPON",code,0,10).items().isEmpty());
            assertNull(repository.catalogItem(catalogId));
            assertThrows(AppException.class,()->service.operate(create(Slot.Weapon2,0,false,"15:0.08")));
            assertEquals(old.id(),slot(Slot.Weapon).assignment().id());
        }
        jdbc.update("UPDATE game_lua_item SET edf_grade=1 WHERE id=?",catalogId);
        assertEquals(catalogId,service.catalog("WEAPON",code,0,10).items().getFirst().id());
        assertNotNull(repository.catalogItem(catalogId));
        jdbc.update("UPDATE game_lua_item SET edf_grade=3,game_code='iwtes50',edf_level=45 WHERE id=?",catalogId);
        assertEquals(catalogId,service.catalog("WEAPON","iwtes50",0,10).items().getFirst().id());
        assertNotNull(repository.catalogItem(catalogId));
    }

    @Test void weaponTypeCIncludesEveryLevelAndReductionVariant() {
        for(int level=35;level<=50;level++) {
            jdbc.update("UPDATE game_lua_item SET edf_grade=3,edf_level=?,edf_name='Fine Intense Weapon' WHERE id=?",level,catalogId);
            assertEquals(catalogId,service.catalog("WEAPON",code,0,10,level,3,"Fine").items().getFirst().id());
            assertNotNull(repository.catalogItem(catalogId));
        }
    }
    @Test void accessoriesUseCoraElementalNamesOrSpecificRingEffectsRegardlessOfGradeAndLevel() {
        for(String category:List.of("RING","AMULET")) {
            for(int effectCode:new int[]{1,2,6,8,15}) {
                var value=new BigDecimal(effectCode==2?"-0.05":effectCode==8?"1":"0.1");
                service.importCatalog(new ImportRequest("a".repeat(64),List.of(new ImportItem(category,code,"Test Accessory",1,0,
                    List.of(new ImportEffect(effectCode,value)),42,"","","00110",255)),List.of()));
                long id=jdbc.queryForObject("SELECT id FROM game_lua_item WHERE category=? AND game_code=?",Long.class,category,code);
                boolean allowed=category.equals("RING") && effectCode!=15;
                assertEquals(allowed,!service.catalog(category,code,0,10).items().isEmpty());
                assertEquals(allowed,repository.catalogItem(id)!=null);
                jdbc.update("UPDATE game_lua_item SET edf_name='Elemental test' WHERE id=?",id);
                assertNotNull(repository.catalogItem(id));
                jdbc.update("UPDATE game_lua_item SET edf_civil='00001' WHERE id=?",id);
                assertTrue(service.catalog(category,code,0,10).items().isEmpty());
                assertEquals(id,service.catalog(category,code,0,10,null,null,null,"ACCRETIA",null).items().getFirst().id());
                assertNotNull(repository.catalogItem(id));
            }
        }
        service.importCatalog(new ImportRequest("a".repeat(64),List.of(new ImportItem("RING",code,"Wrong attack",1,0,
            List.of(new ImportEffect(6,new BigDecimal("0.2"))),42,"","","00110",255)),List.of()));
        assertTrue(service.catalog("RING",code,0,10).items().isEmpty());
    }
    @Test void onlyTheTwoCoraBoosterCodesAndMatchingLevelsAreSelectable() {
        for(String code:List.of("ikcc001","ikcc006","ikcc002","ikbb001")) {
            int level=code.equals("ikcc006")?50:40;
            service.importCatalog(new ImportRequest("a".repeat(64),List.of(new ImportItem("CLOAK",code,"Ether Wing",level,5,
                List.of(),42,"","","00110",255)),List.of()));
            long id=jdbc.queryForObject("SELECT id FROM game_lua_item WHERE category='CLOAK' AND game_code=?",Long.class,code);
            boolean allowed=code.equals("ikcc001") || code.equals("ikcc006");
            assertEquals(allowed,!service.catalog("CLOAK",code,0,10).items().isEmpty());
            assertEquals(allowed,repository.catalogItem(id)!=null);
            jdbc.update("UPDATE game_lua_item SET edf_level=45 WHERE id=?",id);
            assertNull(repository.catalogItem(id));
            jdbc.update("UPDATE game_lua_item SET edf_level=?,edf_civil='00001' WHERE id=?",level,id);
            assertNull(repository.catalogItem(id));
        }
    }

    @Test void accessoryExclusionsApplyToBothSlotsAndEveryRaceWithoutDeletingEquipment() {
        var old=service.operate(create(Slot.Weapon,0,true,"15:0.08"));
        for(var slot:List.of(Slot.Ring1,Slot.Ring2,Slot.Amulet1,Slot.Amulet2)) {
            for(var civil:List.of("11000","00110","00001")) {
                for(var name:List.of("Christmas Elemental Ring","Christmass Elemental Ring","Elemental RingH11","Elemental AmuletH12","Elemental AmuletH55","Elemental Ringh21  ")) {
                    jdbc.update("UPDATE game_lua_item SET category=?,edf_civil=?,edf_name=? WHERE id=?",slot.category,civil,name,catalogId);
                    assertTrue(service.catalog(slot.category,code,0,10,null,null,null,"ALL",null).items().isEmpty());
                    assertNull(repository.catalogItem(catalogId));
                    assertThrows(AppException.class,()->service.operate(create(slot,0,false,"15:0.08")));
                }
            }
        }
        assertEquals(old.id(),slot(Slot.Weapon).assignment().id());
    }
    @Test void accessoryEffectFiltersIncludeMixedBonusesAndRespectRace() {
        for(var category:List.of("RING","AMULET")) {
            service.importCatalog(new ImportRequest("a".repeat(64),List.of(new ImportItem(category,code,"Elemental Mixed",40,1,
                List.of(new ImportEffect(6,new BigDecimal("0.1")),new ImportEffect(4,BigDecimal.TEN),new ImportEffect(7,new BigDecimal("0.1"))),42,"","","00110",255)),List.of()));
            for(var effect:List.of("ATTACK","DODGE","DEFENSE")) {
                assertEquals(1,service.catalog(category,code,0,10,null,null,null,"CORA",null,effect,null).total());
                assertEquals(0,service.catalog(category,code,0,10,null,null,null,"BELLATO",null,effect,null).total());
                assertEquals(0,service.catalog(category,code,0,10,null,null,null,"ACCRETIA",null,effect,null).total());
            }
            jdbc.update("UPDATE game_lua_item SET edf_effects='[{\"code\":6,\"value\":0.1,\"key\":\"6:0.1\",\"name\":\"Attack\",\"displayType\":\"FLAT\"}]'::jsonb WHERE category=? AND game_code=?",category,code);
            assertEquals(0,service.catalog(category,code,0,10,null,null,null,"CORA",null,"DODGE",null).total());
        }
    }
    @Test void weaponTypesFollowClassAndOnlyIntenseNamesRemainSelectable() throws Exception {
        for(int grade:List.of(1,3)) {
            jdbc.update("UPDATE game_lua_item SET edf_grade=?,edf_name='Fine Intense Test' WHERE id=?",grade,catalogId);
            assertNotNull(repository.catalogItem(catalogId));
        }
        for(int type:List.of(0,1,2,3,4,5,6,7,8,9,10,11)) {
            jdbc.update("UPDATE game_lua_item SET edf_weapon_type=? WHERE id=?",type,catalogId);
            for(var equipmentClass:List.of("MELEE","RANGER","FORCE","LAUNCHER")) {
                boolean allowed=equipmentClass.equals("MELEE")?type<=4:equipmentClass.equals("RANGER")?List.of(5,6,8).contains(type):equipmentClass.equals("LAUNCHER")?List.of(7,11).contains(type):type==9;
                var result=service.catalog("WEAPON",code,0,10,null,null,null,"CORA",equipmentClass,null,null);
                assertEquals(allowed,result.total()>0);
                assertEquals(allowed?List.of(type):List.of(),result.weaponTypes());
            }
            assertEquals(1,service.catalog("WEAPON",code,0,10,null,null,null,"CORA",null,null,type).total());
            assertEquals(0,service.catalog("WEAPON",code,0,10,null,null,null,"CORA",null,null,(type+1)%12).total());
        }
        jdbc.update("UPDATE game_lua_item SET edf_name='Relic Staff' WHERE id=?",catalogId);
        assertNull(repository.catalogItem(catalogId));
        assertTrue(service.catalog("WEAPON",code,0,10).items().isEmpty());
        assertThrows(AppException.class,()->service.operate(create(Slot.Weapon,0,true,"15:0.08")));
        for(var params:List.of(Map.of("category","WEAPON","accessoryEffect","ATTACK"),Map.of("category","RING","weaponType","0"),Map.of("category","WEAPON","weaponType","99"),Map.of("category","RING","accessoryEffect","unknown"))) {
            var request=get("/api/equipment/catalog").with(authentication(authenticationFor(actorId)));
            params.forEach(request::param);
            mvc.perform(request).andExpect(status().isBadRequest());
        }
    }
    @Test void importedEffectsUseLootEditorDictionaryAndKeepRawValues() {
        var effect=service.catalog("WEAPON",code,0,10).items().getFirst().effects().getFirst();
        assertEquals("Force Attack",effect.name());
        assertEquals("percent_0_1",effect.unitHint());
        assertEquals(new BigDecimal("0.08"),effect.value());
        assertThrows(AppException.class,()->service.importCatalog(importRequest("Inválido",List.of(new ImportEffect(999,new BigDecimal("1"))))));
    }

    @Test void weaponsAcceptOnlyTheInclusiveLevelRange35To50() {
        for (int level : new int[]{34,35,36,49,50,51,55}) {
            jdbc.update("UPDATE game_lua_item SET edf_level=? WHERE id=?",level,catalogId);
            assertEquals(level>=35 && level<=50, !service.catalog("WEAPON",code,0,10).items().isEmpty());
            if(level<35 || level>50) assertThrows(AppException.class,()->service.operate(create(Slot.Weapon,0,false,"15:0.08")));
        }
    }

    @Test void catalogCombinesLevelGradeAbilityAndSearchWithValidatedHttpParameters() throws Exception {
        code="iwtes43";
        jdbc.update("UPDATE game_lua_item SET game_code=? WHERE id=?",code,catalogId);
        jdbc.update("UPDATE game_lua_item SET edf_level=38,edf_grade=3,edf_name='Fine Intense Test Head' WHERE id=?",catalogId);
        assertEquals(catalogId,service.catalog("WEAPON",code,0,10,38,3,"Fine").items().getFirst().id());
        assertTrue(service.catalog("WEAPON",code,0,10,39,3,"Fine").items().isEmpty());
        assertTrue(service.catalog("WEAPON",code,0,10,38,1,null).items().isEmpty());
        assertTrue(service.catalog("WEAPON",code,0,10,38,3,"Solid").items().isEmpty());
        assertTrue(service.catalog("WEAPON","unmatched",0,10,38,3,"Fine").items().isEmpty());
        assertTrue(service.catalog("WEAPON","unmatched",0,10,38,3,null).abilities().contains("Fine"));
        jdbc.update("UPDATE game_lua_item SET edf_name='Advance Strength Intense Test Head' WHERE id=?",catalogId);
        assertEquals(catalogId,service.catalog("WEAPON",code,0,10,38,3,"Advanced Strength").items().getFirst().id());
        mvc.perform(get("/api/equipment/catalog").with(authentication(authenticationFor(actorId)))
            .param("category","WEAPON").param("level","38").param("grade","3").param("ability","Advanced Strength").param("search",code))
            .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].id").value(catalogId));
        assertThrows(AppException.class,()->service.catalog("WEAPON","",0,10,34,3,null));
        assertThrows(AppException.class,()->service.catalog("WEAPON","",0,10,38,2,null));
        assertThrows(AppException.class,()->service.catalog("WEAPON","",0,10,38,1,"Fine"));
        assertThrows(AppException.class,()->service.catalog("WEAPON","",0,10,38,3,"' OR 1=1"));
    }

    @Test void catalogOrdersLevelsAscendingAcrossPagesAndBeforeExactNameMatches() {
        service.importCatalog(new ImportRequest("b".repeat(64),List.of(
            new ImportItem("WEAPON","iwtes50","Intense SameName",45,3,List.of(),42,"9","","00110",0),
            new ImportItem("WEAPON","iwtes43","Intense Z SameName",38,3,List.of(),42,"9","","00110",0),
            new ImportItem("WEAPON","iwtes47","Intense Y SameName",42,3,List.of(),42,"9","","00110",0),
            new ImportItem("WEAPON","iwtes45","Intense X SameName",40,3,List.of(),42,"9","","00110",0)),List.of()));
        assertEquals(List.of(38,40),service.catalog("WEAPON","SameName",0,2,null,3,null).items().stream().map(CatalogItem::level).toList());
        assertEquals(List.of(42,45),service.catalog("WEAPON","SameName",1,2,null,3,null).items().stream().map(CatalogItem::level).toList());
    }

    @Test void catalogDefaultsToCoraAndCombinesRaceClassWithOtherCriteria() throws Exception {
        jdbc.update("UPDATE game_lua_item SET edf_civil='11000',edf_expert_id=0 WHERE id=?",catalogId);
        assertTrue(service.catalog("WEAPON",code,0,10).items().isEmpty());
        assertEquals(catalogId,service.catalog("WEAPON",code,0,10,null,null,null,"BELLATO","MELEE").items().getFirst().id());
        assertTrue(service.catalog("WEAPON",code,0,10,null,null,null,"BELLATO","FORCE").items().isEmpty());
        code="iwtes43";
        jdbc.update("UPDATE game_lua_item SET game_code=? WHERE id=?",code,catalogId);
        jdbc.update("UPDATE game_lua_item SET edf_civil='00100',edf_level=38,edf_grade=3,edf_name='Fine Intense Test Head' WHERE id=?",catalogId);
        assertEquals(catalogId,service.catalog("WEAPON",code,0,10,38,3,"Fine","CORA","MELEE").items().getFirst().id());
        assertTrue(service.catalog("WEAPON",code,0,10,38,3,"Fine","CORA","RANGER").items().isEmpty());
        assertTrue(service.catalog("WEAPON","",0,10,38,3,null,"CORA","FORCE").abilities().isEmpty());
        jdbc.update("UPDATE game_lua_item SET edf_civil='00010',edf_expert_id=3,edf_weapon_type=9 WHERE id=?",catalogId);
        assertEquals(catalogId,service.catalog("WEAPON",code,0,10,38,3,"Fine","CORA","FORCE").items().getFirst().id());
        jdbc.update("UPDATE game_lua_item SET edf_civil='11111',edf_expert_id=255,edf_weapon_type=5 WHERE id=?",catalogId);
        assertEquals(catalogId,service.catalog("WEAPON",code,0,10,null,null,null,"CORA","RANGER").items().getFirst().id());
        jdbc.update("UPDATE game_lua_item SET edf_civil='00001' WHERE id=?",catalogId);
        mvc.perform(get("/api/equipment/catalog").with(authentication(authenticationFor(actorId)))
            .param("category","WEAPON").param("search",code))
            .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0));
        mvc.perform(get("/api/equipment/catalog").with(authentication(authenticationFor(actorId)))
            .param("category","WEAPON").param("search",code).param("race","ACCRETIA").param("equipmentClass","RANGER"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].id").value(catalogId));
        authenticate(actorId);
        assertEquals(catalogId,service.catalog("WEAPON",code,0,10,null,null,null,"ALL",null).items().getFirst().id());
        assertThrows(AppException.class,()->service.catalog("WEAPON","",0,10,null,null,null,"INVALID",null));
        assertThrows(AppException.class,()->service.catalog("WEAPON","",0,10,null,null,null,"CORA","INVALID"));
    }

    @Test void typeCRequiresExactBaseAndReducedLevelEvenWithoutGradeFilterOrById() {
        var old=service.operate(create(Slot.Weapon,0,true,"15:0.08"));
        jdbc.update("UPDATE game_lua_item SET category='HELMET' WHERE id=?",catalogId);
        for (int[] pair : new int[][]{{43,38},{45,40},{47,42},{50,45}}) {
            String reducedCode="iwtes"+pair[0];
            jdbc.update("UPDATE game_lua_item SET game_code=?,edf_grade=3,edf_name='Fine Intense Test',edf_level=? WHERE id=?",reducedCode,pair[1],catalogId);
            assertEquals(catalogId,service.catalog("HELMET",reducedCode,0,10,pair[1],3,"Fine").items().getFirst().id());
            assertNotNull(repository.catalogItem(catalogId));
            for (int wrongLevel : new int[]{pair[0],pair[1]-1,pair[1]+1}) {
                jdbc.update("UPDATE game_lua_item SET edf_level=? WHERE id=?",wrongLevel,catalogId);
                assertTrue(service.catalog("HELMET",reducedCode,0,10).items().isEmpty());
                assertTrue(service.catalog("HELMET","",0,10,null,3,null).abilities().isEmpty());
                assertNull(repository.catalogItem(catalogId));
                assertThrows(AppException.class,()->service.operate(create(Slot.Weapon2,0,false,"15:0.08")));
            }
        }
        jdbc.update("UPDATE game_lua_item SET game_code='iwtes45',edf_level=45 WHERE id=?",catalogId);
        assertTrue(service.catalog("HELMET","",0,10,45,3,null).items().isEmpty());
        jdbc.update("UPDATE game_lua_item SET game_code='iwtes50' WHERE id=?",catalogId);
        assertEquals(catalogId,service.catalog("HELMET","",0,10,45,3,null).items().getFirst().id());
        jdbc.update("UPDATE game_lua_item SET game_code='custom50' WHERE id=?",catalogId);
        assertNull(repository.catalogItem(catalogId));
        jdbc.update("UPDATE game_lua_item SET edf_grade=1 WHERE id=?",catalogId);
        assertEquals(catalogId,service.catalog("HELMET","",0,10,45,1,null).items().getFirst().id());
        assertEquals(old.id(),slot(Slot.Weapon).assignment().id());
    }

    @Test void specialRareArmorIsUnavailableInEveryArmorCategoryWithoutRemovingHistory() {
        var old=service.operate(create(Slot.Weapon,0,true,"15:0.08"));
        for(var armor:List.of(Slot.Helmet,Slot.Upper,Slot.Lower,Slot.Gloves,Slot.Shoes,Slot.Cloak)) {
            for(var name:List.of("Damaged New Half Mask [Rare D]","Damaged Old Person Mask[Rare D]","New Half Mask [rare e]","Party Mask A")) {
                jdbc.update("UPDATE game_lua_item SET category=?,edf_name=? WHERE id=?",armor.category,name,catalogId);
                assertTrue(service.catalog(armor.category,code,0,10).items().isEmpty());
                assertTrue(service.catalog(armor.category,"",0,10,40,1,null,"ALL",null).items().isEmpty());
                assertNull(repository.catalogItem(catalogId));
                assertThrows(AppException.class,()->service.operate(create(armor,0,false,"15:0.08")));
            }
            jdbc.update("UPDATE game_lua_item SET edf_name='Intense Armor [Rare B]' WHERE id=?",catalogId);
            if(armor==Slot.Cloak) assertNull(repository.catalogItem(catalogId));
            else assertNotNull(repository.catalogItem(catalogId));
        }
        jdbc.update("UPDATE game_lua_item SET category='HELMET',game_code='ihtes43',edf_name='Fine Intense Head [Rare D]',edf_grade=3,edf_level=38 WHERE id=?",catalogId);
        assertTrue(service.catalog("HELMET","",0,10,38,3,null).abilities().isEmpty());
        jdbc.update("UPDATE game_lua_item SET category='WEAPON',game_code=?,edf_name='Intense Weapon [Rare D]',edf_grade=1,edf_level=40 WHERE id=?",code,catalogId);
        assertNotNull(repository.catalogItem(catalogId));
        assertEquals(old.id(),slot(Slot.Weapon).assignment().id());
        assertEquals("Intense Teste EDF",service.history(memberId).getFirst().name());
    }

    @Test void cloakHasItsOwnCategoryAndSlotWithoutMovingExistingEquipment() {
        var weapon=service.operate(create(Slot.Weapon,0,true,"15:0.08"));
        service.importCatalog(new ImportRequest("e".repeat(64),List.of(new ImportItem("CLOAK","ikcc001","Ether Wing",40,5,List.of(),20,"","Efeito próprio","00110",255)),List.of()));
        var cloak=service.catalog("CLOAK","ikcc001",0,10).items().getFirst();
        var record=service.operate(new Operation(UUID.randomUUID(),Action.CREATE,memberId,Slot.Cloak,0L,null,cloak.id(),"none",Origin.INITIAL,LocalDate.now(java.time.ZoneId.of("America/Sao_Paulo")),true,null,null,null));
        assertEquals(record.id(),slot(Slot.Cloak).assignment().id());
        assertEquals(weapon.id(),slot(Slot.Weapon).assignment().id());
        assertEquals(12,service.board().stream().filter(m->m.memberId()==memberId).findFirst().orElseThrow().slots().size());
    }

    @Test void deliveryDoesNotEquipUnlessRequestedAndSnapshotsAreSeparate() {
        var first=service.operate(create(Slot.Weapon,0,false,"15:0.08"));
        assertNull(slot(Slot.Weapon).assignment());
        service.importCatalog(importRequest("Modelo atualizado",List.of(new ImportEffect(15,new BigDecimal("0.12")))));
        var second=service.operate(create(Slot.Weapon2,0,true,"15:0.12"));
        assertEquals(first.effect().value(),new BigDecimal("0.08"));
        assertEquals("Intense Teste EDF",repository.assignment(first.id()).name());
        assertEquals(new BigDecimal("0.12"),second.effect().value());
        assertEquals(second.id(),slot(Slot.Weapon2).assignment().id());
        assertNull(slot(Slot.Weapon).assignment());
    }
    @Test void fullImportRetiresAbsentModelsWithoutChangingExistingSnapshots() {
        var record=service.operate(create(Slot.Weapon,0,true,"15:0.08"));
        assertEquals(42,record.iconId());
        var updated=new ImportItem("WEAPON",code+"new","Intense Substituto",50,1,List.of(),99,"","","11111",0);
        service.importCatalog(new ImportRequest("d".repeat(64),List.of(updated),List.of()));
        assertNull(repository.catalogItem(catalogId));
        var snapshot=repository.assignment(record.id());
        assertEquals(42,snapshot.iconId());
        assertEquals("a".repeat(64),snapshot.sourceHash());
        assertEquals(record.id(),slot(Slot.Weapon).assignment().id());
        assertThrows(AppException.class,()->service.operate(create(Slot.Weapon2,0,false,"15:0.08")));
    }
    @Test void statusChangeKeepsItsOwnReasonActorAndTimeWithoutOverwritingOriginal() {
        var record=service.operate(create(Slot.Weapon,0,false,"15:0.08"));
        service.operate(change(Action.CANCEL,record,0,null,null));
        var cancelled=service.history(memberId).getFirst();
        assertNull(cancelled.reason());
        assertEquals("Correção de teste",cancelled.statusReason());
        assertEquals(members.findById(actorId).orElseThrow().getNickname(),cancelled.statusActorName());
        assertNotNull(cancelled.statusChangedAt());
        assertEquals(record.createdAt(),cancelled.createdAt());
    }
    @Test void replacementIsIdempotentAndRejectsStaleVersion() {
        var first=service.operate(create(Slot.Weapon,0,true,"15:0.08"));
        var request=create(Slot.Weapon,1,true,"15:0.08");
        var second=service.operate(request);
        assertEquals(second.id(),service.operate(request).id());
        assertEquals(2,service.history(memberId).size());
        assertEquals("ACTIVE",repository.assignment(first.id()).status());
        assertEquals(second.id(),slot(Slot.Weapon).assignment().id());
        var conflict=assertThrows(AppException.class,()->service.operate(create(Slot.Weapon,1,true,"15:0.08")));
        assertEquals(409,conflict.getStatus().value());
    }
    @Test void cancellationRequiresExplicitChoiceAndRestoresOnlyChosenRecord() {
        var first=service.operate(create(Slot.Weapon,0,true,"15:0.08"));
        var second=service.operate(create(Slot.Weapon,1,true,"15:0.08"));
        assertThrows(AppException.class,()->service.operate(change(Action.CANCEL,second,2,null,null)));
        service.operate(change(Action.CANCEL,second,2,first.id(),Restoration.PREVIOUS));
        assertEquals(first.id(),slot(Slot.Weapon).assignment().id());
        assertEquals("CANCELLED",repository.assignment(second.id()).status());
        service.operate(change(Action.CANCEL,first,3,null,Restoration.EMPTY));
        assertNull(slot(Slot.Weapon).assignment());
        assertEquals(2,service.history(memberId).size());
    }
    @Test void correctingCreatesNewRecordAndKeepsOriginalAndOrigin() {
        var first=service.operate(create(Slot.Weapon,0,true,"15:0.08"));
        var corrected=service.operate(change(Action.CORRECT,first,1,null,Restoration.EMPTY));
        assertEquals(first.id(),corrected.correctsId());
        assertEquals(Origin.INITIAL,corrected.origin());
        assertEquals("CORRECTED",repository.assignment(first.id()).status());
        assertEquals(Origin.GUILD_DISTRIBUTION,repository.assignment(first.id()).origin());
        assertNull(slot(Slot.Weapon).assignment());
        service.operate(change(Action.EQUIP,corrected,2,null,null));
        assertEquals(corrected.id(),slot(Slot.Weapon).assignment().id());
    }
    @Test void correctionCanExplicitlyEquipAndOldCancellationDoesNotReplaceNewerEquipment() {
        var first=service.operate(create(Slot.Weapon,0,true,"15:0.08"));
        var corrected=service.operate(new Operation(UUID.randomUUID(),Action.CORRECT,memberId,Slot.Weapon,1L,first.id(),
            catalogId,"15:0.08",Origin.INITIAL,LocalDate.now(java.time.ZoneId.of("America/Sao_Paulo")),true,null,null,"Corrigir e equipar"));
        assertEquals(corrected.id(),slot(Slot.Weapon).assignment().id());
        var newer=service.operate(create(Slot.Weapon,2,true,"15:0.08"));
        service.operate(change(Action.CANCEL,corrected,3,null,null));
        assertEquals(newer.id(),slot(Slot.Weapon).assignment().id());
        assertEquals(3,slot(Slot.Weapon).version());
        assertEquals("CANCELLED",repository.assignment(corrected.id()).status());
    }
    @Test void operationIdCannotBeReusedForDifferentDataAndForeignHistoryIsRejected() {
        var request=create(Slot.Weapon,0,false,"15:0.08");
        var record=service.operate(request);
        var changed=new Operation(request.operationId(),Action.CREATE,memberId,Slot.Weapon2,0L,null,catalogId,"15:0.08",
            Origin.GUILD_DISTRIBUTION,LocalDate.now(java.time.ZoneId.of("America/Sao_Paulo")),false,null,null,null);
        assertEquals(409,assertThrows(AppException.class,()->service.operate(changed)).getStatus().value());
        var otherMember=member(Role.MEMBRO,MemberStatus.APROVADO,true);
        var foreign=new Operation(UUID.randomUUID(),Action.EQUIP,otherMember,Slot.Weapon,0L,record.id(),null,null,
            null,null,false,null,null,null);
        assertThrows(AppException.class,()->service.operate(foreign));
    }
    @Test void invalidEffectsCategoriesMembersAndCrossMemberRestoreAreRejected() {
        assertThrows(AppException.class,()->service.operate(create(Slot.Weapon,0,false,"invalid")));
        assertThrows(AppException.class,()->service.operate(create(Slot.Helmet,0,false,"15:0.08")));
        var first=service.operate(create(Slot.Weapon,0,true,"15:0.08"));
        var wrongSlot=service.operate(create(Slot.Weapon2,0,false,"15:0.08"));
        assertThrows(AppException.class,()->service.operate(change(Action.CANCEL,first,1,wrongSlot.id(),Restoration.PREVIOUS)));
        jdbc.update("UPDATE member SET status='EXCLUIDO' WHERE id=?",memberId);
        entityManager.clear();
        assertThrows(AppException.class,()->service.operate(create(Slot.Weapon,1,false,"15:0.08")));
    }
    @Test void membersUpdateOnlyTheirOwnCurrentEquipmentAndCannotReadAnyEquipmentHistory() throws Exception {
        authenticate(memberId);
        var operation=create(Slot.Weapon,0,true,"15:0.08");
        var saved=service.operate(operation);
        assertNull(saved.actorId()); assertNull(saved.actorName()); assertNull(saved.createdAt());
        assertNull(saved.occurredOn()); assertNull(saved.origin());
        var persisted=repository.assignment(saved.id());
        assertEquals(memberId,persisted.actorId().longValue());
        assertNotNull(persisted.createdAt());
        assertEquals(saved.id(),service.operate(operation).id());
        assertNull(service.operate(operation).actorId());
        assertThrows(AppException.class,()->service.operate(create(Slot.Weapon2,0,false,"15:0.08")));
        assertThrows(AppException.class,()->service.history(memberId));
        assertThrows(AppException.class,()->service.history(actorId));
        assertThrows(AppException.class,()->service.importCatalog(importRequest("Sem permissão",List.of())));
        assertThrows(AppException.class,()->service.operate(change(Action.CANCEL,persisted,1,null,Restoration.EMPTY)));
        assertThrows(AppException.class,()->service.operate(new Operation(UUID.randomUUID(),Action.CREATE,actorId,Slot.Weapon,0L,null,catalogId,"15:0.08",Origin.INITIAL,LocalDate.now(java.time.ZoneId.of("America/Sao_Paulo")),true,null,null,null)));
        mvc.perform(post("/api/equipment/operations").with(authentication(authenticationFor(memberId)))
            .contentType("application/json").content(json.writeValueAsString(operation)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(saved.id()))
            .andExpect(jsonPath("$.actorId").doesNotExist()).andExpect(jsonPath("$.createdAt").doesNotExist());
        mvc.perform(get("/api/equipment/members/"+memberId+"/history").with(authentication(authenticationFor(memberId))))
            .andExpect(status().isForbidden());
        mvc.perform(get("/api/equipment").with(authentication(authenticationFor(memberId))))
            .andExpect(status().isOk()).andExpect(jsonPath("$..gearScore.total").isNotEmpty()).andExpect(jsonPath("$..actorId").isEmpty())
            .andExpect(jsonPath("$..actorName").isEmpty()).andExpect(jsonPath("$..createdAt").isEmpty())
            .andExpect(jsonPath("$..occurredOn").isEmpty()).andExpect(jsonPath("$..statusReason").isEmpty())
            .andExpect(jsonPath("$..deliveryOnly").isEmpty());
        authenticate(actorId);
        var edited=service.operate(create(Slot.Weapon,1,true,"15:0.08"));
        assertEquals(actorId,edited.actorId().longValue());
        var history=service.history(memberId);
        assertEquals(2,history.size());
        assertEquals(Set.of(actorId,memberId),history.stream().map(Assignment::actorId).collect(java.util.stream.Collectors.toSet()));
        assertEquals(edited.id(),slot(Slot.Weapon).assignment().id());
        mvc.perform(get("/api/equipment/members/"+memberId+"/history").with(authentication(authenticationFor(actorId))))
            .andExpect(status().isOk()).andExpect(jsonPath("$[0].actorId").value(actorId))
            .andExpect(jsonPath("$[0].createdAt").isNotEmpty());
    }

    @Test void equipmentLogsArePrivateBeforePaginationAndPublicLogCountsExcludeThem() throws Exception {
        service.operate(create(Slot.Weapon,0,true,"15:0.08"));
        entityManager.flush();
        authenticate(memberId);
        var publicPage=logService.list(org.springframework.data.domain.PageRequest.of(0,100));
        assertTrue(publicPage.getContent().stream().noneMatch(log->log.type().isEquipmentPrivate()));
        assertEquals(jdbc.queryForObject("SELECT count(*) FROM audit_log WHERE type NOT IN ('EQUIPMENT_CHANGED','EQUIPMENT_CATALOG_IMPORTED')",Long.class).longValue(),publicPage.getTotalElements());
        mvc.perform(get("/api/logs").param("size","100").with(authentication(authenticationFor(memberId))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content[?(@.type == 'EQUIPMENT_CHANGED')]").isEmpty())
            .andExpect(jsonPath("$.content[?(@.type == 'EQUIPMENT_CATALOG_IMPORTED')]").isEmpty());
        authenticate(member(Role.MODERADOR,MemberStatus.APROVADO,true));
        assertTrue(logService.list(org.springframework.data.domain.PageRequest.of(0,100)).getContent().stream().noneMatch(log->log.type().isEquipmentPrivate()));
        assertThrows(AppException.class,()->service.history(memberId));
        authenticate(actorId);
        var privateLog=logService.list(org.springframework.data.domain.PageRequest.of(0,100)).getContent().stream()
            .filter(log->log.type()==AuditLogType.EQUIPMENT_CHANGED && log.targetId().equals(memberId)).findFirst().orElseThrow();
        assertEquals(actorId,privateLog.actorId().longValue()); assertNotNull(privateLog.createdAt());
        assertNotNull(privateLog.payload().get("record"));
    }

    @Test void unauthorizedAndIncompleteAccountsCannotReadOrMutate() throws Exception {
        SecurityContextHolder.clearContext();
        mvc.perform(get("/api/equipment")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/equipment/operations").with(authentication(authenticationFor(memberId)))
            .contentType("application/json").content(json.writeValueAsString(new Operation(UUID.randomUUID(),Action.CREATE,actorId,Slot.Weapon,0L,null,catalogId,"15:0.08",Origin.INITIAL,LocalDate.now(java.time.ZoneId.of("America/Sao_Paulo")),true,null,null,null))))
            .andExpect(status().isForbidden());
        for(var role:List.of(Role.MEMBRO,Role.MODERADOR)) {
            authenticate(member(role,MemberStatus.APROVADO,true));
            assertThrows(AppException.class,()->service.operate(create(Slot.Weapon,0,true,"15:0.08")));
        }
        authenticate(member(Role.ADMINISTRADOR,MemberStatus.PENDENTE,true));
        assertThrows(AppException.class,()->service.board());
        authenticate(member(Role.ADMINISTRADOR,MemberStatus.APROVADO,false));
        assertThrows(AppException.class,()->service.board());
    }
    @Test void importReusesIdAndKeepsOriginalSharedCatalogFields() {
        jdbc.update("UPDATE game_lua_item SET name='Cadastro existente' WHERE id=?",catalogId);
        service.importCatalog(importRequest("Novo nome EDF",List.of()));
        assertEquals(catalogId,service.catalog("WEAPON",code,0,10).items().getFirst().id());
        assertEquals("Cadastro existente",jdbc.queryForObject("SELECT name FROM game_lua_item WHERE id=?",String.class,catalogId));
        assertEquals("none",service.catalog("WEAPON",code,0,10).items().getFirst().effects().getFirst().key());
        var entry=importRequest("x",List.of()).items().getFirst();
        assertThrows(AppException.class,()->service.importCatalog(new ImportRequest("b".repeat(64),List.of(entry,entry),List.of())));
        service.importCatalog(new ImportRequest("c".repeat(64),List.of(new ImportItem("WEAPON",code+"x","Outro",40,1,List.of(),null,"","","11111",0)),
            List.of(new ExcludedItem("WEAPON",code,"Ambíguo"))));
        assertTrue(service.catalog("WEAPON",code,0,10).items().stream().noneMatch(i->i.id()==catalogId));
    }
    @Test
    @Transactional(propagation=Propagation.NOT_SUPPORTED)
    void concurrentPreviousTransfersOnlyDeliverOnce() throws Exception {
        var old=service.operate(create(Slot.Weapon,0,true,"15:0.08"));
        var upgraded=service.operate(create(Slot.Weapon,1,true,"15:0.08"));
        long target=member(Role.MEMBRO,MemberStatus.APROVADO,true);
        var authentication=authenticationFor(actorId);
        var start=new CountDownLatch(1);
        try(var executor=Executors.newFixedThreadPool(2)) {
            Callable<Boolean> task=()->{
                SecurityContextHolder.getContext().setAuthentication(authentication);
                try { start.await(); service.operate(sendPrevious(old,2,target,0,false)); return true; }
                catch(AppException e) { return false; }
                finally { SecurityContextHolder.clearContext(); }
            };
            var one=executor.submit(task); var two=executor.submit(task); start.countDown();
            assertNotEquals(one.get(20,TimeUnit.SECONDS),two.get(20,TimeUnit.SECONDS));
            assertEquals(1,repository.history(target).size());
            assertEquals(upgraded.id(),slot(Slot.Weapon).assignment().id());
        }
    }
    @Test
    @Transactional(propagation=Propagation.NOT_SUPPORTED)
    void concurrentFirstEquipmentAllowsOneWinner() throws Exception {
        var authentication=authenticationFor(actorId);
        var start=new CountDownLatch(1);
        try(var executor=Executors.newFixedThreadPool(2)) {
            Callable<Integer> task=()->{
                SecurityContextHolder.getContext().setAuthentication(authentication);
                try { start.await(); service.operate(create(Slot.Weapon,0,true,"15:0.08")); return 200; }
                catch(AppException e) { return e.getStatus().value(); }
                finally { SecurityContextHolder.clearContext(); }
            };
            var one=executor.submit(task); var two=executor.submit(task); start.countDown();
            assertEquals(Set.of(200,409),Set.of(one.get(20,TimeUnit.SECONDS),two.get(20,TimeUnit.SECONDS)));
            assertEquals(1,service.history(memberId).size());
            assertEquals(1,slot(Slot.Weapon).version());
        }
    }
}
