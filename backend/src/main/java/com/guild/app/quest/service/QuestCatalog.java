package com.guild.app.quest.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.guild.app.quest.dto.QuestDtos.CatalogQuest;
import com.guild.app.quest.dto.QuestDtos.CouponCatalog;
import com.guild.app.quest.dto.QuestDtos.Event;
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
    public static final String CURRENT_CLIENT="e0e2b6e7fbdb96d3b4e562621508c1c032157634dc01fb172514b6254a23d6cd";
    public static final String CURRENT_EDF="1fa27ad6434aae151eddc0f8a6c40cc27368293206e935e2bccb9debd3877700";
    private static final Map<String,String> CURRENT_COMPLETIONS=loadCompletionProfile();
    private static Map<String,String> loadCompletionProfile() {
        try(var stream=new ClassPathResource("quest/completion-current.json").getInputStream()) {
            var profile=new ObjectMapper().readTree(stream);
            if(!CURRENT_CLIENT.equals(profile.path("clientHash").asText()) || !CURRENT_EDF.equals(profile.path("edfHash").asText()) ||
                profile.path("group").asInt(-1)!=1 || profile.path("type").asInt(-1)!=1) throw new IOException("Completion profile context mismatch");
            var map=new HashMap<String,String>();
            var entries=profile.path("quests").fields();
            while(entries.hasNext()) {
                var row=entries.next();
                if(!row.getKey().matches("Q[0-9A-F]{6}") || !row.getValue().asText().matches("[a-f0-9]{64}")) throw new IOException("Invalid completion definition");
                map.put(row.getKey(),row.getValue().asText());
            }
            if(!map.keySet().equals(DEFAULT_VISIBLE)) throw new IOException("Completion profile must match the selected checklist");
            return Map.copyOf(map);
        } catch(IOException error) { throw new IllegalStateException("Invalid completion profile",error); }
    }
    public static boolean supportsCurrentCompletion(Event event) {
        return CURRENT_CLIENT.equals(event.clientHash()) && CURRENT_EDF.equals(event.edfHash()) && event.group()==1 && event.type()==1 &&
            event.definitionHash().equals(CURRENT_COMPLETIONS.get(event.code()));
    }
    private final Map<String,CatalogQuest> definitions;
    private final Map<String,CatalogQuest> currentDefinitions;
    private final Map<String,String> legacyCouponHashes=new HashMap<>();
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
            var legacy=json.readValue(stream,CouponCatalog.class);
            for(var row:legacy.quests()) legacyCouponHashes.put(row.quest().code(),row.quest().definitionHash());
        }
        try(var stream=new GZIPInputStream(new ClassPathResource("quest/catalog-current.json.gz").getInputStream())) {
            var map=new LinkedHashMap<String,CatalogQuest>();
            for(var row:json.readValue(stream,CatalogQuest[].class)) {
                if(!row.definitionHash().matches("[a-f0-9]{64}") || !row.code().matches("Q[0-9A-F]{6}") || map.put(row.definitionHash(),row)!=null)
                    throw new IOException("Invalid current quest catalog");
            }
            currentDefinitions=Collections.unmodifiableMap(map);
            for(var entry:CURRENT_COMPLETIONS.entrySet()) {
                var definition=currentDefinitions.get(entry.getValue());
                if(definition==null || !definition.code().equals(entry.getKey())) throw new IOException("Completion definition not in current catalog");
            }
        }
        try(var stream=new GZIPInputStream(new ClassPathResource("quest/coupon-catalog-current.json.gz").getInputStream())) {
            coupons=json.readValue(stream,CouponCatalog.class);
            if(!CURRENT_EDF.equals(coupons.sourceHashes().get("quest"))) throw new IOException("Current quest EDF mismatch");
            for(var row:coupons.quests()) if(!row.quest().equals(currentDefinitions.get(row.quest().definitionHash()))) throw new IOException("Unknown daily quest definition");
        }
    }
    public CatalogQuest find(String hash) { return definitions.containsKey(hash)?definitions.get(hash):currentDefinitions.get(hash); }
    public boolean matches(String code,String hash,String title) {
        var row=new CatalogQuest(code,title,hash);
        return row.equals(definitions.get(hash)) || row.equals(currentDefinitions.get(hash));
    }
    public boolean matchesContext(String client,String edf,String code,String hash,String title) {
        var rows=CLIENT.equals(client)&&EDF.equals(edf)?definitions:
            CURRENT_CLIENT.equals(client)&&CURRENT_EDF.equals(edf)?currentDefinitions:Map.<String,CatalogQuest>of();
        return new CatalogQuest(code,title,hash).equals(rows.get(hash));
    }
    public boolean hidden(CatalogQuest quest,Map<String,Boolean> visibility) {
        return visibility.getOrDefault(quest.definitionHash(),visibility.getOrDefault(
            legacyCouponHashes.getOrDefault(quest.code(),quest.definitionHash()),!DEFAULT_VISIBLE.contains(quest.code())));
    }
    public boolean defaultHidden(String hash) { return !DEFAULT_VISIBLE.contains(find(hash).code()); }
    public boolean daily(String hash) { return coupons.quests().stream().anyMatch(r->r.quest().definitionHash().equals(hash)); }
}
