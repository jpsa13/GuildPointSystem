package com.guild.app.schedule;

import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;

public final class GameEventDefinitions {

    public static final ZoneId SCHEDULE_ZONE = ZoneId.of("America/Sao_Paulo");
    /** Cerberus server time (Moscow, UTC+3): 00:00 there = 18:00 in Brasília. */
    public static final ZoneId SERVER_ZONE = ZoneId.of("Europe/Moscow");
    public static final long TEN_MINUTE_WARNING_MS = 10 * 60 * 1000L;

    private GameEventDefinitions() {}

    public sealed interface GameEvent permits DailyGameEvent, IntervalGameEvent {
        String id();

        String label();
    }

    public record DailyGameEvent(String id, String label, int hour, int minute, ZoneId zone)
            implements GameEvent {
        public DailyGameEvent(String id, String label, int hour, int minute) {
            this(id, label, hour, minute, SCHEDULE_ZONE);
        }
    }

    public record IntervalGameEvent(String id, String label, int intervalDays, ZonedDateTime anchor)
            implements GameEvent {}

    private static final ZonedDateTime PBS_MAJOR_ANCHOR =
            ZonedDateTime.of(2026, 9, 27, 19, 0, 0, 0, SCHEDULE_ZONE);

    public static final List<GameEvent> ALL = List.of(
            // CW in server time: 06:00 / 14:00 / 22:00 (= 00:00 / 08:00 / 16:00 Brasília).
            new DailyGameEvent("cw1", "CW1", 6, 0, SERVER_ZONE),
            new DailyGameEvent("cw2", "CW2", 14, 0, SERVER_ZONE),
            new DailyGameEvent("cw3", "CW3", 22, 0, SERVER_ZONE),
            new DailyGameEvent("pbs-elan", "PB Elan", 19, 0),
            new IntervalGameEvent("pbs-major", "PB Major", 4, PBS_MAJOR_ANCHOR));
}
