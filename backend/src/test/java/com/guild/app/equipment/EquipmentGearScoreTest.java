package com.guild.app.equipment;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.guild.app.equipment.dto.EquipmentDtos.*;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import java.util.*;
import java.util.zip.GZIPInputStream;
import static org.junit.jupiter.api.Assertions.*;

class EquipmentGearScoreTest {
    final ObjectMapper json=new ObjectMapper();
    final EquipmentGearScore calculator=new EquipmentGearScore(json);
    EquipmentGearScoreTest() throws Exception {}

    GearScore item(String category,String code) throws Exception {
        try (var in=new GZIPInputStream(new ClassPathResource("equipment-catalog.json.gz").getInputStream())) {
            var root=json.readTree(in);
            for (var i:root.path("items")) if (i.path("category").asText().equals(category) && i.path("gameCode").asText().equals(code))
                return calculator.score(category,code,i.path("name").asText(),i.path("level").asInt(),i.path("grade").asInt(),root.path("sourceHash").asText());
        }
        throw new AssertionError("Item de teste não encontrado: "+code);
    }
    @Test void preservesTheCurveAndInterpolatesIntermediateLevels() {
        int[] levels={35,39,41,43,45,47,50,53,55};
        int[] b={310,310,319,348,388,445,507,570,630};
        int[] c={334,334,345,376,419,480,547,615,680};
        for (int n=0;n<levels.length;n++) {
            assertEquals(b[n],EquipmentGearScore.baseScore(levels[n],1));
            assertEquals(c[n],EquipmentGearScore.baseScore(levels[n],3));
        }
        assertEquals(334,EquipmentGearScore.baseScore(42,1));
        assertNull(EquipmentGearScore.baseScore(66,1));
        assertNull(EquipmentGearScore.baseScore(50,99));
    }
    @Test void usesOriginalModelLevelsForAllFourArmorReductions() throws Exception {
        String[] codes={"ihtws43","ihtws45","ihtws47","ihtws50"};
        int[] levels={43,45,47,50}, points={376,419,480,547};
        for (int n=0;n<codes.length;n++) {
            var score=item("HELMET",codes[n]);
            assertEquals(levels[n],score.originalLevel());assertEquals(points[n],score.points());
        }
        assertEquals(2735,item("WEAPON","iwsze50").points());
    }
    @Test void cafeOnlyWindElvenBladeHasZeroScoreWithoutBeingUnscored() throws Exception {
        var score=item("WEAPON","iwepc01");
        assertEquals(new GearScore(0,1,true),score);
        var member=new MemberEquipment(1,"Player",50,null,null,null,null,
            List.of(new CurrentSlot(Slot.Weapon,1,assignment(Slot.Weapon,score))));
        assertEquals(new GearScoreTotal(0,0,0,0,0),member.gearScore());
    }
    @Test void weightsAllAccessoryEffectsAndHandlesNegativeFpConsumption() throws Exception {
        assertEquals(1050,item("RING","iiccb02").points()); // ataque 25%
        assertEquals(1350,item("AMULET","iacca80").points()); // ataque 25% + defesa 20%
        assertEquals(390,item("RING","iicca46").points()); // consumo FP -10%
        assertEquals(750,item("RING","iiccb03").points()); // skill +1
        assertNull(item("RING","iicca78").points()); // sem bônus confirmados
        assertNull(calculator.score("HELMET","ihtws50","Strong Intense Rogue FullHelm",45,3,"unknown").points());
        assertFalse(calculator.score("CLOAK","x","Capa",50,0,"x").included());
    }
    Assignment assignment(Slot slot,GearScore score) {
        return new Assignment(1,1,slot,1,"x","Item",45,3,slot.category,null,null,null,null,null,null,"ACTIVE",null,null,null,null,null,null,null,score,false);
    }
    @Test void countsOneWeaponFiveArmorPiecesAndFourAccessoriesWithoutAuditLeakage() {
        var slots=new ArrayList<CurrentSlot>();
        slots.add(new CurrentSlot(Slot.Weapon,1,assignment(Slot.Weapon,new GearScore(2735,50,true))));
        slots.add(new CurrentSlot(Slot.Weapon2,1,assignment(Slot.Weapon2,new GearScore(2000,45,true))));
        for (var slot:List.of(Slot.Helmet,Slot.Upper,Slot.Lower,Slot.Gloves,Slot.Shoes)) slots.add(new CurrentSlot(slot,1,assignment(slot,new GearScore(547,50,true))));
        for (var slot:List.of(Slot.Amulet1,Slot.Amulet2,Slot.Ring1,Slot.Ring2)) slots.add(new CurrentSlot(slot,1,assignment(slot,new GearScore(1350,null,true))));
        slots.add(new CurrentSlot(Slot.Cloak,1,assignment(Slot.Cloak,new GearScore(null,null,false))));
        var member=new MemberEquipment(1,"Player",50,null,null,null,null,slots);
        assertEquals(new GearScoreTotal(10870,2735,2735,5400,0),member.gearScore());
        assertEquals(member.gearScore(),new MemberEquipment(1,"Player",50,null,null,null,null,slots.stream().map(s->new CurrentSlot(s.slot(),s.version(),s.assignment().withoutAudit())).toList()).gearScore());
        slots.add(new CurrentSlot(Slot.Gloves,1,assignment(Slot.Gloves,new GearScore(null,null,true))));
        assertEquals(1,member.gearScore().unscored());
    }
}
