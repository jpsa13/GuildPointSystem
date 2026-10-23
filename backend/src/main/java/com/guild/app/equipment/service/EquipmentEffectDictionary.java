package com.guild.app.equipment.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.guild.app.common.exception.AppException;
import com.guild.app.equipment.dto.EquipmentDtos.Effect;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import java.io.IOException;
import java.math.BigDecimal;
import java.util.*;

@Component
public class EquipmentEffectDictionary {
    public record Definition(String dictionaryKey, String itemType, int code, String name, String description, String unitHint) {}
    private final Map<String, Definition> definitions = new HashMap<>();

    public EquipmentEffectDictionary(ObjectMapper json) throws IOException {
        try (var input = new ClassPathResource("equipment-effects.json").getInputStream()) {
            for (var node : json.readTree(input).get("entries")) {
                var definition = json.treeToValue(node, Definition.class);
                definitions.put(definition.itemType()+":"+definition.code(), definition);
            }
        }
    }

    public Effect effect(int code, BigDecimal value, String itemType) {
        var definition = definitions.getOrDefault(Objects.toString(itemType, "")+":"+code, definitions.get(":"+code));
        if (definition == null) throw new AppException("Efeito sem definição no dicionário de equipamentos: "+code, HttpStatus.BAD_REQUEST);
        return new Effect(code+":"+value.stripTrailingZeros().toPlainString(), code, definition.name(), "FLAT", value,
            definition.description(), definition.unitHint());
    }
}
