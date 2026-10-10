import { describe, expect, it } from 'vitest'
import { computeLandingDelta, segmentAtPointer } from './Roulette.utils'

describe('Roulette', () => {
  it('segmentAtPointer maps the unrotated wheel to segment 0', () => {
    expect(segmentAtPointer(0.1, 4)).toBe(3) // slightly clockwise → last segment under pointer
    expect(segmentAtPointer(-1, 4)).toBe(0)
  })

  it('lands on the drawn winner from any starting angle', () => {
    for (const count of [2, 3, 5, 8, 13]) {
      for (let winner = 0; winner < count; winner++) {
        for (const start of [0, 37.5, 359.9, 1234.56, -90]) {
          for (const offset of [0.2, 0.5, 0.8]) {
            const delta = computeLandingDelta(start, count, winner, 900, offset)
            expect(segmentAtPointer(start + delta, count)).toBe(winner)
          }
        }
      }
    }
  })

  it('always rotates forward at least the minimum distance', () => {
    const delta = computeLandingDelta(100, 4, 2, 900)
    expect(delta).toBeGreaterThanOrEqual(900)
    expect(delta).toBeLessThan(900 + 360)
  })
})
