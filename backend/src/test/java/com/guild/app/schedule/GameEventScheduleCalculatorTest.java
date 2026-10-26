package com.guild.app.schedule;

import org.junit.jupiter.api.Test;

import java.time.ZonedDateTime;

import static com.guild.app.schedule.GameEventDefinitions.SCHEDULE_ZONE;
import static org.junit.jupiter.api.Assertions.assertEquals;

class GameEventScheduleCalculatorTest {

    private final GameEventScheduleCalculator calculator = new GameEventScheduleCalculator();

    @Test
    void dailyNextOccurrenceLaterToday() {
        ZonedDateTime now = ZonedDateTime.of(2026, 3, 26, 5, 30, 0, 0, SCHEDULE_ZONE);
        var event = new GameEventDefinitions.DailyGameEvent("cw1", "CW1", 6, 0);
        ZonedDateTime next = calculator.nextOccurrence(event, now);
        assertEquals(26, next.getDayOfMonth());
        assertEquals(6, next.getHour());
    }

    @Test
    void dailyRollsToTomorrowAtStart() {
        ZonedDateTime now = ZonedDateTime.of(2026, 3, 26, 6, 0, 0, 0, SCHEDULE_ZONE);
        var event = new GameEventDefinitions.DailyGameEvent("cw1", "CW1", 6, 0);
        ZonedDateTime next = calculator.nextOccurrence(event, now);
        assertEquals(27, next.getDayOfMonth());
    }

    @Test
    void serverZoneCwAt22MoscowIs16Brasilia() {
        ZonedDateTime now = ZonedDateTime.of(2026, 3, 26, 15, 0, 0, 0, SCHEDULE_ZONE);
        var event = new GameEventDefinitions.DailyGameEvent(
                "cw3", "CW3", 22, 0, GameEventDefinitions.SERVER_ZONE);
        ZonedDateTime next = calculator.nextOccurrence(event, now);
        assertEquals(26, next.getDayOfMonth());
        assertEquals(16, next.getHour());
    }

    @Test
    void intervalAtAnchorMovesByFourDays() {
        ZonedDateTime anchor = ZonedDateTime.of(2026, 9, 27, 19, 0, 0, 0, SCHEDULE_ZONE);
        var event = new GameEventDefinitions.IntervalGameEvent("pbs-major", "PB Major", 4, anchor);
        ZonedDateTime now = anchor;
        ZonedDateTime next = calculator.nextOccurrence(event, now);
        assertEquals(1, next.getDayOfMonth());
        assertEquals(10, next.getMonthValue());
    }

    @Test
    void multiDailyPicksNearestServerHour() {
        // PB Colônia 02/10/18 Brasília.
        var event = new GameEventDefinitions.MultiDailyGameEvent(
                "pb-colonia", "PB Colônia", java.util.List.of(2, 10, 18), 0, SCHEDULE_ZONE);
        ZonedDateTime afternoon = ZonedDateTime.of(2026, 3, 26, 13, 0, 0, 0, SCHEDULE_ZONE);
        ZonedDateTime next = calculator.nextOccurrence(event, afternoon);
        assertEquals(26, next.getDayOfMonth());
        assertEquals(18, next.getHour());

        ZonedDateTime night = ZonedDateTime.of(2026, 3, 26, 21, 0, 0, 0, SCHEDULE_ZONE);
        next = calculator.nextOccurrence(event, night);
        assertEquals(27, next.getDayOfMonth());
        assertEquals(2, next.getHour());
    }
}
