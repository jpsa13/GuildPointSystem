import { describe, expect, it } from 'vitest'
import {
  formatHmsCountdown,
  getMsUntilNextDailyEvent,
  getMsUntilNextIntervalEvent,
  getNextDailyOccurrence,
  getNextIntervalOccurrence,
} from './dailyEventSchedule'

describe('dailyEventSchedule', () => {
  it('getNextDailyOccurrence returns later today when time not passed', () => {
    const now = new Date('2026-03-26T05:30:00-03:00')
    const next = getNextDailyOccurrence(6, 0, now)
    expect(next.toISOString()).toBe('2026-03-26T09:00:00.000Z')
  })

  it('getNextDailyOccurrence rolls to tomorrow after event time', () => {
    const now = new Date('2026-03-26T06:00:00-03:00')
    const next = getNextDailyOccurrence(6, 0, now)
    expect(next.toISOString()).toBe('2026-03-27T09:00:00.000Z')
  })

  it('getMsUntilNextDailyEvent is ~24h right at start', () => {
    const now = new Date('2026-03-26T06:00:00-03:00')
    const ms = getMsUntilNextDailyEvent(6, 0, now)
    expect(ms).toBe(24 * 60 * 60 * 1000)
  })

  it('formatHmsCountdown pads segments', () => {
    expect(formatHmsCountdown((2 * 3600 + 5 * 60 + 7) * 1000)).toBe('02:05:07')
  })

  it('formatHmsCountdown shows days when over 24h', () => {
    expect(formatHmsCountdown((2 * 86400 + 3 * 3600) * 1000)).toBe('2d 03:00:00')
  })

  const majorAnchor = new Date('2026-09-27T19:00:00-03:00')

  it('interval: before anchor counts to anchor', () => {
    const now = new Date('2026-09-26T20:00:00-03:00')
    const next = getNextIntervalOccurrence(majorAnchor, 4, now)
    expect(next.getTime()).toBe(majorAnchor.getTime())
  })

  it('interval: at anchor start, next is +4 days', () => {
    const now = new Date(majorAnchor)
    const next = getNextIntervalOccurrence(majorAnchor, 4, now)
    expect(next.toISOString()).toBe('2026-10-01T22:00:00.000Z')
  })

  it('interval: ms until next after anchor', () => {
    const now = new Date('2026-09-28T12:00:00-03:00')
    const ms = getMsUntilNextIntervalEvent(majorAnchor, 4, now)
    const next = new Date(now.getTime() + ms)
    expect(next.toISOString()).toBe('2026-10-01T22:00:00.000Z')
  })
})
