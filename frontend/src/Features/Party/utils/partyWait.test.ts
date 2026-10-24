import { describe, expect, it } from 'vitest'
import type { PartyLfgEntry } from '@/Features/Party/Party.types'
import { formatWaiting, sortByWaiting } from './partyWait'

const entry = (memberId: number, createdAt: string): PartyLfgEntry => ({
  memberId,
  nickname: `M${memberId}`,
  className: null,
  classImageUrl: null,
  level: 1,
  expPercent: null,
  note: null,
  createdAt,
})

describe('formatWaiting', () => {
  it('shows minutes and seconds under an hour', () => {
    expect(formatWaiting(0)).toBe('0:00')
    expect(formatWaiting(65_000)).toBe('1:05')
    expect(formatWaiting(59 * 60_000 + 59_000)).toBe('59:59')
  })

  it('shows hours and minutes from one hour on', () => {
    expect(formatWaiting(3_600_000)).toBe('1h 00m')
    expect(formatWaiting(2 * 3_600_000 + 7 * 60_000 + 30_000)).toBe('2h 07m')
  })

  it('never goes negative (client clock ahead of server)', () => {
    expect(formatWaiting(-5_000)).toBe('0:00')
  })
})

describe('sortByWaiting', () => {
  it('puts whoever has waited longest first', () => {
    const sorted = sortByWaiting([
      entry(1, '2026-10-10T20:05:00Z'),
      entry(2, '2026-10-10T20:01:00Z'),
      entry(3, '2026-10-10T20:03:00Z'),
    ])
    expect(sorted.map((e) => e.memberId)).toEqual([2, 3, 1])
  })

  it('breaks ties by member id', () => {
    const sorted = sortByWaiting([entry(9, '2026-10-10T20:00:00Z'), entry(4, '2026-10-10T20:00:00Z')])
    expect(sorted.map((e) => e.memberId)).toEqual([4, 9])
  })
})
