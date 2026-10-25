package com.guild.app.equipment;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.guild.app.equipment.dto.EquipmentDtos.GearScore;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;
import java.util.regex.Pattern;
import java.util.zip.GZIPInputStream;

@Component
public class EquipmentGearScore {
    private static final NavigableMap<Integer, BigDecimal> BASES = new TreeMap<>();
    static {
        int[] levels = {1,39,40,41,43,45,47,50,53,55,57,60,63,65};
        String[] values = {"31","31","31.48","31.97","34.84","38.87","44.50","50.71","57","63","69","78","88.20","95"};
        for (int i=0;i<levels.length;i++) BASES.put(levels[i],new BigDecimal(values[i]));
    }
    private static final Map<Integer,String> GRADES = Map.of(0,"0.95",1,"1",2,"1.03",3,"1.08",10,"1.15");
    private static final Pattern MODEL_CODE = Pattern.compile("i[whulgs][a-z]{3}(\\d{2})");
    private record Item(String name,int level,int grade,JsonNode effects) {}
    private final Map<String,Item> catalog = new HashMap<>();
    private final String sourceHash;

    public EquipmentGearScore(ObjectMapper json) throws IOException {
        try (var in = new GZIPInputStream(new ClassPathResource("equipment-catalog.json.gz").getInputStream())) {
            var source=json.readTree(in);
            sourceHash=source.path("sourceHash").asText();
            for (var item:source.path("items")) {
                String category=item.path("category").asText();
                catalog.put(category+":"+item.path("gameCode").asText(),new Item(item.path("name").asText(),
                    item.path("level").asInt(),item.path("grade").asInt(),
                    category.equals("RING") || category.equals("AMULET")?item.path("effects"):null));
            }
        }
    }

    public GearScore score(String category,String code,String name,int level,int grade,String hash) {
        if (category.equals("CLOAK")) return new GearScore(null,null,false);
        var item=catalog.get(category+":"+code);
        boolean verified=item!=null && Objects.equals(sourceHash,hash) && item.name().equals(name)
            && item.level()==level && item.grade()==grade;
        if (category.equals("RING") || category.equals("AMULET"))
            return new GearScore(verified?accessory(item.effects()):null,null,true);
        if (!Set.of("WEAPON","HELMET","UPPER","LOWER","GLOVES","SHOES").contains(category))
            return new GearScore(null,null,true);
        Integer original=level;
        if (grade==3) {
            // Só interpretar o código de modelo após conferir o registro no EDF distribuído.
            var model=MODEL_CODE.matcher(code);
            if (!verified || !model.matches()) return new GearScore(null,null,true);
            original=Integer.parseInt(model.group(1));
            if (original<level) return new GearScore(null,null,true);
        }
        Integer points=baseScore(original,grade);
        return new GearScore(points==null?null:points*(category.equals("WEAPON")?5:1),original,true);
    }

    public static Integer baseScore(int level,int grade) {
        if (level<1 || level>BASES.lastKey() || !GRADES.containsKey(grade)) return null;
        var lo=BASES.floorEntry(level);
        var hi=BASES.ceilingEntry(level);
        BigDecimal base=lo.getValue();
        if (!lo.getKey().equals(hi.getKey())) base=base.add(hi.getValue().subtract(base)
            .multiply(BigDecimal.valueOf(level-lo.getKey())).divide(BigDecimal.valueOf(hi.getKey()-lo.getKey()),12,RoundingMode.HALF_UP));
        return base.multiply(new BigDecimal(GRADES.get(grade))).setScale(2,RoundingMode.HALF_UP).movePointRight(1).intValue();
    }

    private static Integer accessory(JsonNode effects) {
        if (!effects.isArray() || effects.isEmpty()) return null;
        var contributions=new HashMap<Integer,BigDecimal>();
        for (var effect:effects) {
            int code=effect.path("code").asInt();
            BigDecimal value=effect.path("value").decimalValue();
            if (code==2 && value.signum()<0) value=value.abs();
            if (value.signum()<=0) return null;
            int multiplier=switch(code) {
                case 6,7 -> 1000; // valores percentuais do EDF são frações de 1
                case 4 -> 10;
                case 1,2 -> 300;
                case 5 -> 800; // HP + FP: 5 + 3 pontos por ponto percentual
                case 8 -> 150;
                default -> 0;
            };
            if (multiplier==0) return null;
            contributions.merge(code,value.multiply(BigDecimal.valueOf(multiplier)),BigDecimal::add);
        }
        var total=contributions.values().stream().reduce(BigDecimal.ZERO,BigDecimal::add);
        var strongest=contributions.values().stream().max(BigDecimal::compareTo).orElse(BigDecimal.ZERO);
        return total.add(strongest).divide(BigDecimal.valueOf(2)).add(BigDecimal.valueOf(100))
            .multiply(BigDecimal.valueOf(3)).setScale(0,RoundingMode.HALF_UP).intValue();
    }
}
