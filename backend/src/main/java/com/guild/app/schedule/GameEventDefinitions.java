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

    public sealed interface GameEvent permits DailyGameEvent, MultiDailyGameEvent, IntervalGameEvent {
        String id();

        String label();
    }

    public record DailyGameEvent(String id, String label, int hour, int minute, ZoneId zone)
            implements GameEvent {
        public DailyGameEvent(String id, String label, int hour, int minute) {
            this(id, label, hour, minute, SCHEDULE_ZONE);
        }
    }

    /** Several fixed times per day; counts down to the nearest one. */
    public record MultiDailyGameEvent(String id, String label, List<Integer> hours, int minute, ZoneId zone)
            implements GameEvent {}

    public record IntervalGameEvent(String id, String label, int intervalDays, ZonedDateTime anchor)
            implements GameEvent {}

    public static final List<GameEvent> ALL = List.of(
            // CW in server time: 06:00 / 14:00 / 22:00 (= 00:00 / 08:00 / 16:00 Brasília).
            new DailyGameEvent("cw1", "CW1", 6, 0, SERVER_ZONE),
            new DailyGameEvent("cw2", "CW2", 14, 0, SERVER_ZONE),
            new DailyGameEvent("cw3", "CW3", 22, 0, SERVER_ZONE),
            // PBs in Brasília time.
            new MultiDailyGameEvent("pb-hq", "PB HQ", List.of(2, 6, 10, 14, 18, 22), 0, SCHEDULE_ZONE),
            new MultiDailyGameEvent("pb-colonia", "PB Colônia", List.of(2, 10, 18), 0, SCHEDULE_ZONE),
            new DailyGameEvent("pb-middle", "PB Middle", 14, 0, SCHEDULE_ZONE));
}
