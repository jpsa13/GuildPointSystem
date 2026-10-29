package com.guild.app.equipment.repository;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.guild.app.equipment.dto.EquipmentDtos.*;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import java.util.*;

@Repository
@RequiredArgsConstructor
public class EquipmentRepository {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final com.guild.app.equipment.EquipmentGearScore gearScore;

    public List<Integer> relics(long memberId) {
        return jdbc.queryForList("SELECT relic_id FROM member_equipment_relic WHERE member_id=? ORDER BY relic_id",Integer.class,memberId);
    }
    public boolean setRelic(long memberId,int relicId,boolean active) {
        return (active ? jdbc.update("INSERT INTO member_equipment_relic(member_id,relic_id) VALUES(?,?) ON CONFLICT DO NOTHING",memberId,relicId)
            : jdbc.update("DELETE FROM member_equipment_relic WHERE member_id=? AND relic_id=?",memberId,relicId))>0;
    }

    public ReviewStatus review(long memberId) {
        return jdbc.query("""
            SELECT *, confirmed_at IS NULL AND due_at<=now() AS overdue FROM equipment_review_request
            WHERE member_id=? ORDER BY requested_at DESC,id DESC LIMIT 1
            """,(r,n)->new ReviewStatus(r.getObject("id",UUID.class),r.getLong("member_id"),
                r.getTimestamp("requested_at").toInstant(),r.getTimestamp("due_at").toInstant(),
                r.getTimestamp("confirmed_at")==null?null:r.getTimestamp("confirmed_at").toInstant(),
                r.getTimestamp("confirmed_at")!=null?"CONFIRMED":r.getBoolean("overdue")?"OVERDUE":"PENDING",r.getBoolean("overdue")),memberId)
            .stream().findFirst().orElse(null);
    }
    public Map<String,Object> reviewOperation(UUID id) {
        return jdbc.queryForList("SELECT member_id,requested_by FROM equipment_review_request WHERE id=?",id).stream().findFirst().orElse(null);
    }
    public void requestReview(UUID id,long memberId,long actorId) {
        jdbc.update("INSERT INTO equipment_review_request(id,member_id,requested_by) VALUES(?,?,?)",id,memberId,actorId);
    }
    public int confirmReview(UUID id,long memberId) {
        return jdbc.update("UPDATE equipment_review_request SET confirmed_at=now() WHERE id=? AND member_id=? AND confirmed_at IS NULL",id,memberId);
    }
    public String encode(Object value) {
        try { return json.writeValueAsString(value); }
        catch (JsonProcessingException e) { throw new IllegalStateException(e); }
    }
    public <T> T decode(String value, Class<T> type) {
        try { return json.readValue(value, type); }
        catch (JsonProcessingException e) { throw new IllegalStateException(e); }
    }
    private List<Effect> effects(String value) {
        try { return json.readValue(value, new TypeReference<List<Effect>>() {}); }
        catch (JsonProcessingException e) { throw new IllegalStateException(e); }
    }
    private final static String ASSIGNMENTS = """
        SELECT a.*, i.catalog_item_id, i.game_code, i.category, i.item_name, i.item_level, i.item_grade, i.effect,
               i.icon_id, i.source_hash, changed.nickname AS status_actor_name,
               m.nickname AS actor_name FROM equipment_assignment a
        JOIN equipment_instance i ON i.id=a.instance_id JOIN member m ON m.id=a.created_by_id
        LEFT JOIN member changed ON changed.id=a.status_actor_id
        """;
    private RowMapper<Assignment> assignmentMapper() {
        return (r,n) -> new Assignment(r.getLong("id"), r.getLong("member_id"), Slot.valueOf(r.getString("slot")),
            r.getLong("catalog_item_id"), r.getString("game_code"), r.getString("item_name"), r.getInt("item_level"),
            r.getInt("item_grade"), r.getString("category"), decode(r.getString("effect"), Effect.class),
            Origin.valueOf(r.getString("origin")), r.getDate("occurred_on").toLocalDate(), r.getLong("created_by_id"),
            r.getString("actor_name"), r.getTimestamp("created_at").toInstant(), r.getString("status"),
            r.getObject("corrects_id",Long.class), r.getString("reason"), r.getObject("icon_id",Integer.class),
            r.getString("source_hash"), r.getString("status_reason"), r.getString("status_actor_name"),
            r.getTimestamp("status_changed_at")==null?null:r.getTimestamp("status_changed_at").toInstant(),
            gearScore.score(r.getString("category"),r.getString("game_code"),r.getString("item_name"),
                r.getInt("item_level"),r.getInt("item_grade"),r.getString("source_hash")),r.getBoolean("delivery_only"));
    }
    public List<Assignment> history(long memberId) {
        return jdbc.query(ASSIGNMENTS+" WHERE a.member_id=? ORDER BY a.created_at DESC,a.id DESC", assignmentMapper(),memberId);
    }
    public Assignment assignment(long id) {
        return jdbc.query(ASSIGNMENTS+" WHERE a.id=?",assignmentMapper(),id).stream().findFirst().orElse(null);
    }
    public boolean isEquipped(long id) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM member_equipment_slot WHERE assignment_id=?)",Boolean.class,id));
    }
    public List<MemberEquipment> board() {
        var assigned = jdbc.query(ASSIGNMENTS+" JOIN member_equipment_slot s ON s.assignment_id=a.id",assignmentMapper());
        var byId = new HashMap<Long,Assignment>();
        assigned.forEach(a->byId.put(a.id(),a));
        var slots = new HashMap<Long,Map<String,CurrentSlot>>();
        jdbc.query("SELECT * FROM member_equipment_slot", r->{
            var id=r.getObject("assignment_id",Long.class);
            slots.computeIfAbsent(r.getLong("member_id"),k->new HashMap<>()).put(r.getString("slot"),
                new CurrentSlot(Slot.valueOf(r.getString("slot")),r.getLong("version"),id==null?null:byId.get(id)));
        });
        return jdbc.query("""
            SELECT m.id,m.nickname,COALESCE(cs.level,m.level) AS level,cs.exp_percent,m.class_id,c.name AS class_name,c.image_url AS class_image_url
            FROM member m LEFT JOIN character_class c ON c.id=m.class_id
            LEFT JOIN LATERAL (SELECT level,exp_percent FROM character_status WHERE member_id=m.id
                ORDER BY updated_at DESC,id DESC LIMIT 1) cs ON true
            WHERE m.status='APROVADO' ORDER BY lower(m.nickname),m.id
            """,(r,n)->{
            long id=r.getLong("id");
            return new MemberEquipment(id,r.getString("nickname"),r.getInt("level"),r.getObject("exp_percent",Float.class),
                r.getObject("class_id",Long.class),r.getString("class_name"),r.getString("class_image_url"), Arrays.stream(Slot.values())
                .map(s->slots.getOrDefault(id,Map.of()).getOrDefault(s.name(),new CurrentSlot(s,0,null))).toList());
        });
    }
    public CurrentSlot slot(long memberId, Slot slot) {
        return jdbc.query("SELECT * FROM member_equipment_slot WHERE member_id=? AND slot=?",(r,n)-> {
            var id=r.getObject("assignment_id",Long.class);
            return new CurrentSlot(slot,r.getLong("version"),id==null?null:assignment(id));
        },memberId,slot.name()).stream().findFirst().orElse(new CurrentSlot(slot,0,null));
    }
    public void setSlot(long memberId, Slot slot, Long id) {
        jdbc.update("""
            INSERT INTO member_equipment_slot(member_id,slot,assignment_id,version) VALUES(?,?,?,1)
            ON CONFLICT(member_id,slot) DO UPDATE SET assignment_id=EXCLUDED.assignment_id,version=member_equipment_slot.version+1
            """,memberId,slot.name(),id);
    }
    public void status(long id, String status, String reason, long actorId) {
        jdbc.update("UPDATE equipment_assignment SET status=?,status_reason=?,status_actor_id=?,status_changed_at=now() WHERE id=?",
            status,reason,actorId,id);
    }
    public Assignment create(Operation op, CatalogItem item, Effect effect, String hash, long actorId, Long correctsId) {
        Long instanceId=jdbc.queryForObject("""
            INSERT INTO equipment_instance(catalog_item_id,game_code,category,item_name,item_level,item_grade,source_hash,effect,icon_id)
            VALUES(?,?,?,?,?,?,?,?::jsonb,?) RETURNING id
            """,Long.class,item.id(),item.gameCode(),item.category(),item.name(),item.level(),item.grade(),hash,encode(effect),item.iconId());
        Long id=jdbc.queryForObject("""
            INSERT INTO equipment_assignment(member_id,instance_id,slot,origin,occurred_on,created_by_id,corrects_id,reason,delivery_only)
            VALUES(?,?,?,?,?,?,?,?,?) RETURNING id
            """,Long.class,op.memberId(),instanceId,op.slot().name(),op.origin().name(),op.occurredOn(),actorId,correctsId,op.reason(),
                op.quantity()!=null || (correctsId!=null && Boolean.TRUE.equals(assignment(correctsId).deliveryOnly())));
        return assignment(id);
    }
    public Assignment transfer(Assignment source, long memberId, Slot slot, long actorId, java.time.LocalDate date, String reason) {
        var op=new Operation(null,Action.CREATE,memberId,slot,0L,null,null,null,Origin.GUILD_DISTRIBUTION,date,true,null,null,reason);
        var item=new CatalogItem(source.catalogId(),source.category(),source.gameCode(),source.name(),source.level(),
            source.grade(),List.of(source.effect()),source.iconId(),source.sourceHash(),null);
        return create(op,item,source.effect(),source.sourceHash(),actorId,null);
    }
    public List<Map<String,Object>> previous(UUID id) { return jdbc.queryForList("SELECT * FROM equipment_operation WHERE id=?",id); }
    public boolean sameRequest(Map<String,Object> previous,long actorId,Operation op) {
        return ((Number)previous.get("actor_id")).longValue()==actorId &&
            decode(previous.get("request").toString(),Operation.class).equals(op);
    }
    public void remember(Operation op,long actorId,long id) {
        jdbc.update("INSERT INTO equipment_operation(id,actor_id,request,assignment_id) VALUES(?,?,?::jsonb,?)",
            op.operationId(),actorId,encode(op),id);
    }
    public Map<String,Object> slotEdit(UUID id) {
        return jdbc.queryForList("SELECT * FROM equipment_slot_edit WHERE id=?",id).stream().findFirst().orElse(null);
    }
    public void rememberSlotEdit(SlotEdit request,long actorId,SlotEditResult before,SlotEditResult after) {
        jdbc.update("INSERT INTO equipment_slot_edit(id,actor_id,member_id,request,before_state,after_state) VALUES(?,?,?,?::jsonb,?::jsonb,?::jsonb)",
            request.operationId(),actorId,request.memberId(),encode(request),encode(before),encode(after));
    }
    // O sufixo identifica a família-base; LevelLim distingue as variantes rebaixadas no EDF.
    private static final String ALLOWED_TYPE_C = "(edf_grade<>3 OR (game_code ~ '^i[hulgsw][a-z]{3}[0-9]{2}$' AND ((right(game_code,2)='43' AND edf_level=38) OR (right(game_code,2)='45' AND edf_level=40) OR (right(game_code,2)='47' AND edf_level=42) OR (right(game_code,2)='50' AND edf_level=45))))";
    private static final String ALLOWED_ARMOR = "NOT (category IN ('HELMET','UPPER','LOWER','GLOVES','SHOES','CLOAK') AND (edf_name ~* '\\[Rare[[:space:]]+[DE]\\]' OR edf_name ILIKE '%Party Mask%'))";
    private static final String CORA_CIVIL = "(substring(edf_civil,3,1)='1' OR substring(edf_civil,4,1)='1')";
    // A elegibilidade é compartilhada pela busca e pelo cadastro direto por ID.
    private static final String SELECTABLE = "edf_source_hash IS NOT NULL AND "+ALLOWED_ARMOR+" AND ("
        +"(category='WEAPON' AND edf_grade IN (1,3) AND edf_level BETWEEN 35 AND 50 AND edf_name ILIKE '%Intense%') OR "
        +"(category IN ('HELMET','UPPER','LOWER','GLOVES','SHOES') AND edf_grade IN (1,3) AND edf_level BETWEEN 35 AND 55 AND "+ALLOWED_TYPE_C+") OR "
        +"(category IN ('RING','AMULET') AND edf_name NOT ILIKE '%Christmas%' AND edf_name !~* 'H[0-9]+[[:space:]]*$' AND (edf_name ILIKE '%Elemental%' OR (category='RING' AND EXISTS ("
        +"SELECT 1 FROM jsonb_array_elements(edf_effects) effect WHERE "
        +"((effect->>'code')::int=6 AND abs((effect->>'value')::numeric-0.1)<0.000001) OR "
        +"((effect->>'code')::int=8 AND (effect->>'value')::numeric=1) OR "
        +"((effect->>'code')::int=2 AND (effect->>'value')::numeric<0) OR "
        +"((effect->>'code')::int=1 AND (effect->>'value')::numeric>0))))) OR "
        +"(category='CLOAK' AND "+CORA_CIVIL+" AND ((game_code='ikcc001' AND edf_level=40) OR (game_code='ikcc006' AND edf_level=50))))";
    public CatalogItem catalogItem(long id) {
        return jdbc.query("SELECT * FROM game_lua_item WHERE "+SELECTABLE+" AND id=? FOR SHARE",catalogMapper(),id)
            .stream().findFirst().orElse(null);
    }
    // A sincronização pelo jogo aceita qualquer item do catálogo EDF, não só os selecionáveis no cadastro manual.
    public CatalogItem clientCatalogItem(String category,String gameCode) {
        return jdbc.query("SELECT * FROM game_lua_item WHERE edf_source_hash IS NOT NULL AND edf_effects IS NOT NULL AND category=? AND game_code=? FOR SHARE",
            catalogMapper(),category,gameCode).stream().findFirst().orElse(null);
    }
    // Registro ativo mais recente do mesmo item na posição e fora de uso: reequipar não duplica o histórico.
    // Entregas avulsas ficam no registro de itens entregues e não viram equipamento sincronizado.
    public Long idleAssignment(long memberId,Slot slot,String gameCode) {
        return jdbc.query("""
            SELECT a.id FROM equipment_assignment a JOIN equipment_instance i ON i.id=a.instance_id
            WHERE a.member_id=? AND a.slot=? AND i.game_code=? AND a.status='ACTIVE' AND NOT a.delivery_only
              AND NOT EXISTS (SELECT 1 FROM member_equipment_slot s WHERE s.assignment_id=a.id)
            ORDER BY a.created_at DESC,a.id DESC LIMIT 1
            """,(r,n)->r.getLong(1),memberId,slot.name(),gameCode).stream().findFirst().orElse(null);
    }
    private RowMapper<CatalogItem> catalogMapper() {
        return (r,n)->new CatalogItem(r.getLong("id"),r.getString("category"),r.getString("game_code"),
            r.getString("edf_name"),r.getInt("edf_level"),r.getInt("edf_grade"),effects(r.getString("edf_effects")),
            r.getObject("edf_icon_id",Integer.class),r.getString("edf_source_hash"),r.getString("edf_effects_note"));
    }
    // Os nomes distinguem habilidades que compartilham código de efeito (ex.: Solid/Guardian).
    private static final String ABILITY_RAW = "substring(edf_name from '(?i)(advanced strength|advance strength|endurance|protection|protectoion|vampiric|vampire|guardian|strength|strong|solid|sharp|grand|smart|wind|fine|pain)[[:space:]]+(?:intense|superior)[[:space:]]')";
    private static final String ABILITY = "CASE lower("+ABILITY_RAW+") WHEN 'advance strength' THEN 'Advanced Strength' WHEN 'protectoion' THEN 'Protection' WHEN 'vampiric' THEN 'Vampire' ELSE initcap("+ABILITY_RAW+") END";
    public CatalogPage catalog(String category,String search,int page,int size,Integer level,Integer grade,String ability,String race,String equipmentClass,String accessoryEffect,Integer weaponType) {
        String base=" WHERE "+SELECTABLE+" AND category=?";
        var args=new ArrayList<Object>(); args.add(category);
        String raceCondition=switch(race) {
            case "CORA" -> " AND (substring(edf_civil,3,1)='1' OR substring(edf_civil,4,1)='1')";
            case "BELLATO" -> " AND (substring(edf_civil,1,1)='1' OR substring(edf_civil,2,1)='1')";
            case "ACCRETIA" -> " AND substring(edf_civil,5,1)='1'";
            default -> "";
        };
        base+=raceCondition;
        if(equipmentClass!=null) {
            int expert=switch(equipmentClass) { case "MELEE" -> 0; case "RANGER" -> 1; case "FORCE" -> 3; case "LAUNCHER" -> 2; default -> throw new IllegalArgumentException("Classe inválida"); };
            if(category.equals("WEAPON")) base+=" AND edf_weapon_type IN ("+switch(equipmentClass) {case "MELEE" -> "0,1,2,3,4"; case "RANGER" -> "5,6,8"; case "LAUNCHER" -> "7,11"; default -> "9";}+")";
            else { base+=" AND edf_expert_id IN (?,255)"; args.add(expert); }
        }
        if(level!=null) { base+=" AND edf_level=?"; args.add(level); }
        if(grade!=null) { base+=" AND edf_grade=?"; args.add(grade); }
        if(accessoryEffect!=null) {
            int effect=switch(accessoryEffect) {case "ATTACK" -> 6; case "DODGE" -> 4; default -> 7;};
            base+=" AND EXISTS (SELECT 1 FROM jsonb_array_elements(edf_effects) effect WHERE (effect->>'code')::int=? AND (effect->>'value')::numeric>0)"; args.add(effect);
        }
        var weaponTypes=category.equals("WEAPON")?jdbc.queryForList("SELECT DISTINCT edf_weapon_type FROM game_lua_item"+base+" AND edf_weapon_type IS NOT NULL ORDER BY edf_weapon_type",Integer.class,args.toArray()):List.<Integer>of();
        if(weaponType!=null) { base+=" AND edf_weapon_type=?"; args.add(weaponType); }
        var abilities=jdbc.queryForList("SELECT DISTINCT "+ABILITY+" AS ability FROM game_lua_item"+base+" AND edf_grade=3 AND "+ABILITY+" IS NOT NULL ORDER BY ability",String.class,args.toArray());
        if(ability!=null && !ability.isBlank()) { base+=" AND edf_grade=3 AND "+ABILITY+"=?"; args.add(ability); }
        String where=base+" AND (edf_name ILIKE ? ESCAPE '!' OR game_code ILIKE ? ESCAPE '!')";
        String pattern="%"+search.replace("!","!!").replace("%","!%").replace("_","!_")+"%";
        args.add(pattern); args.add(pattern);
        long total=jdbc.queryForObject("SELECT count(*) FROM game_lua_item"+where,Long.class,args.toArray());
        args.add(search); args.add(search); args.add(size); args.add((long)page*size);
        return new CatalogPage(jdbc.query("SELECT * FROM game_lua_item"+where+" ORDER BY edf_level ASC,CASE WHEN lower(game_code)=lower(?) THEN 0 WHEN lower(edf_name)=lower(?) THEN 1 ELSE 2 END,lower(edf_name),id LIMIT ? OFFSET ?",
            catalogMapper(),args.toArray()),total,page,size,abilities,weaponTypes);
    }
    public void importItems(ImportRequest request, List<List<Effect>> effects) {
        // O lote é um retrato completo: ausências/inativos não podem continuar selecionáveis.
        jdbc.update("UPDATE game_lua_item SET edf_source_hash=NULL WHERE edf_source_hash IS NOT NULL");
        jdbc.batchUpdate("""
            INSERT INTO game_lua_item(category,game_code,name,game_index,icon_id,sprite_sheet,sprite_cols,item_grade,level_required,
                edf_name,edf_level,edf_grade,edf_effects,edf_source_hash,edf_icon_id,edf_effects_note,edf_civil,edf_expert_id,edf_weapon_type)
            VALUES(?,?,?,0,0,'',32,?,?, ?,?,?,?::jsonb,?,?,?,?,?,?)
            ON CONFLICT(category,game_code) DO UPDATE SET edf_name=EXCLUDED.edf_name,edf_level=EXCLUDED.edf_level,
                edf_grade=EXCLUDED.edf_grade,edf_effects=EXCLUDED.edf_effects,edf_source_hash=EXCLUDED.edf_source_hash,
                edf_icon_id=EXCLUDED.edf_icon_id,edf_effects_note=EXCLUDED.edf_effects_note,
                edf_civil=EXCLUDED.edf_civil,edf_expert_id=EXCLUDED.edf_expert_id,edf_weapon_type=EXCLUDED.edf_weapon_type
            """,java.util.stream.IntStream.range(0,request.items().size()).mapToObj(index->{
                var i=request.items().get(index);
                return new Object[]{i.category(),i.gameCode(),i.name(),i.grade(),i.level(),i.name(),
                    i.level(),i.grade(),encode(effects.get(index)),request.sourceHash(),i.iconId(),i.effectsNote(),i.civil(),i.expertId(),
                    i.category().equals("WEAPON") && i.itemType()!=null && i.itemType().matches("(?:[0-9]|1[01])")?Integer.valueOf(i.itemType()):null};
            }).toList());
        for(var excluded:request.excluded()) jdbc.update("UPDATE game_lua_item SET edf_source_hash=NULL WHERE category=? AND game_code=?",excluded.category(),excluded.gameCode());
        jdbc.update("""
            INSERT INTO equipment_catalog_import(source_hash,imported_count,excluded) VALUES(?,?,?::jsonb)
            ON CONFLICT(source_hash) DO UPDATE SET imported_at=now(),imported_count=EXCLUDED.imported_count,excluded=EXCLUDED.excluded
            """,request.sourceHash(),request.items().size(),encode(request.excluded()));
    }
    public Map<String,Object> importStatus() {
        var rows=jdbc.queryForList("SELECT source_hash,imported_at,imported_count,excluded::text FROM equipment_catalog_import ORDER BY imported_at DESC LIMIT 1");
        return rows.isEmpty()?Map.of():rows.getFirst();
    }
    public boolean hasCatalogMetadata() {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM game_lua_item WHERE edf_source_hash IS NOT NULL)",Boolean.class));
    }
    public void lockImport() { jdbc.execute("SELECT pg_advisory_xact_lock(55055)"); }
}
