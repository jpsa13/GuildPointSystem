package com.guild.app.quest.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.guild.app.quest.dto.QuestDtos.CatalogQuest;
import com.guild.app.quest.dto.QuestDtos.CouponCatalog;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import java.io.IOException;
import java.util.*;
import java.util.zip.GZIPInputStream;

@Component
public class QuestCatalog {
    private static final Set<String> DEFAULT_VISIBLE=Set.of("Q071396","Q071397","Q071398","Q071399","Q071400",
        "Q071401","Q071402","Q071403","Q071404","Q071405","Q071382","Q071406","Q071450","Q070944","Q070947");
    public static final String CLIENT="8343dc2afba9537f5c41c713b3af5516d0be75f6ad9a9bdb6ed9722238645379";
    public static final String EDF="fa5e6d236cce98265cae4fc3bc5374ba8560824bbdef94ffb0ed8ec269456e98";
    private final Map<String,CatalogQuest> definitions;
    public final CouponCatalog coupons;
    public QuestCatalog(ObjectMapper json) throws IOException {
        try(var stream=new GZIPInputStream(new ClassPathResource("quest/catalog.json.gz").getInputStream())) {
            var rows=json.readValue(stream,CatalogQuest[].class);
            var map=new LinkedHashMap<String,CatalogQuest>();
            for(var row:rows) {
                if(!row.definitionHash().matches("[a-f0-9]{64}") || !row.code().matches("Q[0-9A-F]{6}") || map.put(row.definitionHash(),row)!=null)
                    throw new IOException("Invalid quest catalog");
            }
            definitions=Collections.unmodifiableMap(map);
        }
        try(var stream=new GZIPInputStream(new ClassPathResource("quest/coupon-catalog.json.gz").getInputStream())) {
            coupons=json.readValue(stream,CouponCatalog.class);
            for(var row:coupons.quests()) if(!row.quest().equals(definitions.get(row.quest().definitionHash()))) throw new IOException("Unknown daily quest definition");
        }
    }
    public CatalogQuest find(String hash) { return definitions.get(hash); }
    public boolean defaultHidden(String hash) { return !DEFAULT_VISIBLE.contains(definitions.get(hash).code()); }
    public boolean daily(String hash) { return coupons.quests().stream().anyMatch(r->r.quest().definitionHash().equals(hash)); }
}
