export interface RouletteSegment {
  id: string | number
  label: string
}

/**
 * idle = waiting (countdown); spinning = free spin, winner unknown; landing = decelerating onto
 * `winnerIndex`; stopped = already decided, rests on `winnerIndex` without animating.
 */
export type RoulettePhase = 'idle' | 'spinning' | 'landing' | 'stopped'

export interface RouletteProps {
  segments: RouletteSegment[]
  phase: RoulettePhase
  /** Only known once the server has drawn the winner (landing phase). */
  winnerIndex: number | null
  landingMs: number
  onStopped?: (winnerIndex: number) => void
}

/** Free-spin speed in degrees per second. */
export const SPIN_DEG_PER_SEC = 540
