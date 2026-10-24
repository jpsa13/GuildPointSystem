package com.guild.app.party.repository;

import com.guild.app.party.entity.PartyDiscordCall;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import java.util.*;

public interface PartyDiscordCallRepository extends JpaRepository<PartyDiscordCall,Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from PartyDiscordCall c where c.partyId=:id")
    Optional<PartyDiscordCall> lock(Long id);
    @Query("select c.partyId from PartyDiscordCall c where c.state in ('WAITING','SENDING')")
    List<Long> activeIds();
    @Query(value="select party_id from party_discord_call where channel_id=:channel and messages @> cast(:message as jsonb)",nativeQuery=true)
    List<Long> findMessage(String channel,String message);
}
