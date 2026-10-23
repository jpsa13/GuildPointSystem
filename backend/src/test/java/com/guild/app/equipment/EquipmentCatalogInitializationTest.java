package com.guild.app.equipment;

import com.guild.app.equipment.service.EquipmentService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class EquipmentCatalogInitializationTest {
    @Autowired EquipmentService service;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach void emptyEquipmentCatalog() {
        SecurityContextHolder.clearContext();
        jdbc.update("DELETE FROM equipment_catalog_import");
        jdbc.update("UPDATE game_lua_item SET edf_source_hash=NULL WHERE edf_source_hash IS NOT NULL");
    }

    @Test void loadsBundledCatalogWithoutLoginAndDoesNotReloadIt() throws Exception {
        var original=jdbc.queryForMap("SELECT name,icon_id,sprite_sheet FROM game_lua_item WHERE category='WEAPON' AND game_code='iwsta25'");
        long assignments=jdbc.queryForObject("SELECT count(*) FROM equipment_assignment",Long.class);
        long logs=jdbc.queryForObject("SELECT count(*) FROM audit_log WHERE type='EQUIPMENT_CATALOG_IMPORTED'",Long.class);

        service.initializeCatalog();

        assertEquals(50612,jdbc.queryForObject("SELECT count(*) FROM game_lua_item WHERE edf_source_hash IS NOT NULL",Integer.class));
        assertEquals(50612,jdbc.queryForObject("SELECT imported_count FROM equipment_catalog_import",Integer.class));
        assertEquals(8256,jdbc.queryForObject("SELECT count(*) FROM game_lua_item WHERE category='WEAPON' AND edf_source_hash IS NOT NULL AND edf_weapon_type IS NOT NULL",Integer.class));
        for(var category:java.util.List.of("WEAPON","HELMET","UPPER","LOWER","GLOVES","SHOES","RING","AMULET","CLOAK")) {
            assertTrue(jdbc.queryForObject("SELECT count(*) FROM game_lua_item WHERE category=? AND edf_source_hash IS NOT NULL AND edf_civil LIKE '__1%'",Integer.class,category)>0,category);
        }
        assertEquals(2,jdbc.queryForObject("SELECT count(*) FROM game_lua_item WHERE game_code IN ('ikcc001','ikcc006') AND category='CLOAK' AND edf_source_hash IS NOT NULL",Integer.class));
        assertEquals(original,jdbc.queryForMap("SELECT name,icon_id,sprite_sheet FROM game_lua_item WHERE category='WEAPON' AND game_code='iwsta25'"));
        assertEquals(assignments,jdbc.queryForObject("SELECT count(*) FROM equipment_assignment",Long.class));
        assertEquals(logs+1,jdbc.queryForObject("SELECT count(*) FROM audit_log WHERE type='EQUIPMENT_CATALOG_IMPORTED'",Long.class));
        assertNull(jdbc.queryForObject("SELECT actor_id FROM audit_log WHERE type='EQUIPMENT_CATALOG_IMPORTED' ORDER BY id DESC LIMIT 1",Long.class));
        var importedAt=jdbc.queryForObject("SELECT imported_at FROM equipment_catalog_import",java.sql.Timestamp.class);
        jdbc.update("UPDATE game_lua_item SET edf_name='Nome administrado' WHERE category='CLOAK' AND game_code='ikcc001'");

        service.initializeCatalog();

        assertEquals(importedAt,jdbc.queryForObject("SELECT imported_at FROM equipment_catalog_import",java.sql.Timestamp.class));
        assertEquals("Nome administrado",jdbc.queryForObject("SELECT edf_name FROM game_lua_item WHERE category='CLOAK' AND game_code='ikcc001'",String.class));
        assertEquals(logs+1,jdbc.queryForObject("SELECT count(*) FROM audit_log WHERE type='EQUIPMENT_CATALOG_IMPORTED'",Long.class));
    }

    @Test void preservesExistingImportEvenWhenItsCatalogIsEmpty() throws Exception {
        jdbc.update("INSERT INTO equipment_catalog_import(source_hash,imported_count,excluded) VALUES(?,0,'[]'::jsonb)","b".repeat(64));
        service.initializeCatalog();
        assertEquals("b".repeat(64),jdbc.queryForObject("SELECT source_hash FROM equipment_catalog_import",String.class));
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM game_lua_item WHERE edf_source_hash IS NOT NULL",Integer.class));
    }

    @Test void preservesExistingMetadataWithoutImportHistory() throws Exception {
        jdbc.update("UPDATE game_lua_item SET edf_source_hash=?,edf_name='Personalizado' WHERE category='WEAPON' AND game_code='iwsta25'","c".repeat(64));
        service.initializeCatalog();
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM equipment_catalog_import",Integer.class));
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM game_lua_item WHERE edf_source_hash IS NOT NULL",Integer.class));
        assertEquals("Personalizado",jdbc.queryForObject("SELECT edf_name FROM game_lua_item WHERE category='WEAPON' AND game_code='iwsta25'",String.class));
    }
}
