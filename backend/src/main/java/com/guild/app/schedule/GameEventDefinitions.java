package com.guild.app.schedule;

import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;

public final class GameEventDefinitions {

    public static final ZoneId SCHEDULE_ZONE = ZoneId.of("America/Sao_Paulo");
    public static final long TEN_MINUTE_WARNING_MS = 10 * 60 * 1000L;

    private GameEventDefinitions() {}

    public sealed interface GameEvent permits DailyGameEvent, IntervalGameEvent {
        String id();

        String label();
    }

    public record DailyGameEvent(String id, String label, int hour, int minute) implements GameEvent {}

    public record IntervalGameEvent(String id, String label, int intervalDays, ZonedDateTime anchor)
            implements GameEvent {}

    private static final ZonedDateTime PBS_MAJOR_ANCHOR =
            ZonedDateTime.of(2026, 9, 27, 19, 0, 0, 0, SCHEDULE_ZONE);

    public static final List<GameEvent> ALL = List.of(
            new DailyGameEvent("cw1", "CW1", 8, 0),
            new DailyGameEvent("cw2", "CW2", 16, 0),
            new DailyGameEvent("cw3", "CW3", 0, 0),
            new DailyGameEvent("pbs-elan", "PB Elan", 19, 0),
            new IntervalGameEvent("pbs-major", "PB Major", 4, PBS_MAJOR_ANCHOR));
}
