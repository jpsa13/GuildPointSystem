package com.guild.app.schedule;

import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.ZonedDateTime;

import static com.guild.app.schedule.GameEventDefinitions.GameEvent;
import static com.guild.app.schedule.GameEventDefinitions.DailyGameEvent;
import static com.guild.app.schedule.GameEventDefinitions.IntervalGameEvent;
import static com.guild.app.schedule.GameEventDefinitions.SCHEDULE_ZONE;

@Component
public class GameEventScheduleCalculator {

    private static final long MS_PER_DAY = Duration.ofDays(1).toMillis();

    public ZonedDateTime nextOccurrence(GameEvent event, ZonedDateTime now) {
        ZonedDateTime zonedNow = now.withZoneSameInstant(SCHEDULE_ZONE);
        if (event instanceof DailyGameEvent daily) {
            return nextDaily(daily.hour(), daily.minute(), zonedNow.withZoneSameInstant(daily.zone()))
                    .withZoneSameInstant(SCHEDULE_ZONE);
        }
        if (event instanceof IntervalGameEvent interval) {
            return nextInterval(interval.anchor(), interval.intervalDays(), zonedNow);
        }
        throw new IllegalArgumentException("Unknown event type");
    }

    public long millisUntil(GameEvent event, ZonedDateTime now) {
        ZonedDateTime next = nextOccurrence(event, now);
        return Math.max(0, Duration.between(now.withZoneSameInstant(SCHEDULE_ZONE), next).toMillis());
    }

    static ZonedDateTime nextDaily(int hour, int minute, ZonedDateTime now) {
        ZonedDateTime candidate = now.toLocalDate().atTime(hour, minute).atZone(now.getZone());
        if (!now.isBefore(candidate)) {
            candidate = candidate.plusDays(1);
        }
        return candidate;
    }

    static ZonedDateTime nextInterval(ZonedDateTime anchor, int intervalDays, ZonedDateTime now) {
        long anchorMs = anchor.toInstant().toEpochMilli();
        long intervalMs = intervalDays * MS_PER_DAY;
        long nowMs = now.toInstant().toEpochMilli();
        if (nowMs < anchorMs) {
            return anchor;
        }
        long elapsed = nowMs - anchorMs;
        long periods = elapsed / intervalMs + 1;
        return ZonedDateTime.ofInstant(
                java.time.Instant.ofEpochMilli(anchorMs + periods * intervalMs), SCHEDULE_ZONE);
    }
}
