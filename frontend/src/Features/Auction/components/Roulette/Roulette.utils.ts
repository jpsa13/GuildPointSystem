function mod360(deg: number) {
  return ((deg % 360) + 360) % 360
}

/** Segment under the top pointer for a wheel rotated clockwise by `rotation` degrees. */
export function segmentAtPointer(rotation: number, segmentCount: number): number {
  return Math.floor(mod360(-rotation) / (360 / segmentCount)) % segmentCount
}

/**
 * Extra rotation needed to stop on `winnerIndex` (at `offset` ∈ (0,1) inside its segment),
 * never less than `minDelta` so the ease-out starts at least as fast as the free spin.
 */
export function computeLandingDelta(
  currentRotation: number,
  segmentCount: number,
  winnerIndex: number,
  minDelta: number,
  offset = 0.5,
): number {
  const segmentAngle = 360 / segmentCount
  const target = mod360(360 - (winnerIndex + offset) * segmentAngle)
  let delta = mod360(target - mod360(currentRotation))
  while (delta < minDelta) delta += 360
  return delta
}

export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3
