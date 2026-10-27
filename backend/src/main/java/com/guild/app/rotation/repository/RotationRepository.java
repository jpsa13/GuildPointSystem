package com.guild.app.rotation.repository;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.guild.app.rotation.dto.RotationDtos.*;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
@RequiredArgsConstructor
public class RotationRepository {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    public Schedule read() {
        return jdbc.queryForObject("SELECT version,updated_at,slots::text FROM boss_rotation WHERE id=1",(rs,n)-> {
            try { return new Schedule(rs.getLong(1),rs.getTimestamp(2).toInstant(),List.of(json.readValue(rs.getString(3),Slot[].class))); }
            catch(JsonProcessingException e) { throw new IllegalStateException("Invalid saved rotation",e); }
        });
    }
    public boolean update(Update request,long actor) {
        try {
            return jdbc.update("UPDATE boss_rotation SET slots=?::jsonb,version=version+1,updated_at=now(),updated_by=? WHERE id=1 AND version=?",
                json.writeValueAsString(request.slots()),actor,request.version())==1;
        } catch(JsonProcessingException e) { throw new IllegalStateException(e); }
    }
}
