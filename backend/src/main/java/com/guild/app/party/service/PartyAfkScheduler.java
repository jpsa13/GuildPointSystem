package com.guild.app.party.service;

import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import java.time.Instant;

@Component
@RequiredArgsConstructor
public class PartyAfkScheduler {
    private final PartyService parties;

    @Scheduled(fixedDelay=1000)
    public void tick() { parties.expireAfk(Instant.now()); }
}
