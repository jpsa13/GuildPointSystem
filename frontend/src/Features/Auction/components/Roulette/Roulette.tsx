import { useEffect, useMemo, useRef } from 'react'
import type { RouletteProps } from './Roulette.types'
import { SPIN_DEG_PER_SEC } from './Roulette.types'
import { computeLandingDelta, easeOutCubic } from './Roulette.utils'
import './Roulette.styles.scss'

const COLORS = ['var(--roulette-c1)', 'var(--roulette-c2)', 'var(--roulette-c3)', 'var(--roulette-c4)']

export function Roulette({ segments, phase, winnerIndex, landingMs, onStopped }: RouletteProps) {
  const wheelRef = useRef<HTMLDivElement>(null)
  const rotationRef = useRef(0)
  const onStoppedRef = useRef(onStopped)
  useEffect(() => {
    onStoppedRef.current = onStopped
  }, [onStopped])

  const segmentAngle = useMemo(
    () => (segments.length > 0 ? 360 / segments.length : 0),
    [segments.length],
  )

  useEffect(() => {
    // Labels read `--rot` to counter-rotate, so names stay upright while riding their slice.
    const paint = () => {
      wheelRef.current?.style.setProperty('--rot', `${rotationRef.current}deg`)
    }
    if (phase === 'idle' || segments.length === 0) return

    // Already decided (e.g. page reloaded after the draw): rest on the winner, no animation.
    if (phase === 'stopped') {
      if (winnerIndex !== null) {
        rotationRef.current = 360 - (winnerIndex + 0.5) * (360 / segments.length)
        paint()
      }
      return
    }

    let frame = 0
    let last = performance.now()

    // Free spin — also used while landing if the drawn index never reached this client.
    if (phase === 'spinning' || winnerIndex === null) {
      const step = (now: number) => {
        rotationRef.current += (SPIN_DEG_PER_SEC * (now - last)) / 1000
        last = now
        paint()
        frame = requestAnimationFrame(step)
      }
      frame = requestAnimationFrame(step)
      return () => cancelAnimationFrame(frame)
    }

    // Landing: ease-out from the current angle onto the winner. Initial speed of an
    // ease-out cubic is 3Δ/D, so Δ ≥ ω·D/3 keeps the wheel from visibly slowing down first.
    const duration = Math.max(1500, landingMs)
    const from = rotationRef.current
    const offset = 0.2 + Math.random() * 0.6
    const delta = computeLandingDelta(
      from,
      segments.length,
      winnerIndex,
      (SPIN_DEG_PER_SEC * duration) / 1000 / 3,
      offset,
    )
    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      rotationRef.current = from + delta * easeOutCubic(t)
      paint()
      if (t < 1) {
        frame = requestAnimationFrame(step)
      } else {
        onStoppedRef.current?.(winnerIndex)
      }
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [phase, winnerIndex, landingMs, segments.length])

  if (segments.length === 0) return null

  return (
    <div className="roulette">
      <div className="roulette__pointer" />
      <div className="roulette__wheel" ref={wheelRef}>
        <svg viewBox="0 0 200 200" className="roulette__svg">
          {segments.map((seg, i) => {
            const startAngle = (i * segmentAngle - 90) * (Math.PI / 180)
            const endAngle = ((i + 1) * segmentAngle - 90) * (Math.PI / 180)
            const x1 = 100 + 90 * Math.cos(startAngle)
            const y1 = 100 + 90 * Math.sin(startAngle)
            const x2 = 100 + 90 * Math.cos(endAngle)
            const y2 = 100 + 90 * Math.sin(endAngle)
            const largeArc = segmentAngle > 180 ? 1 : 0
            return (
              <g key={seg.id}>
                {segments.length === 1 ? (
                  <circle cx="100" cy="100" r="90" fill={COLORS[0]} />
                ) : (
                  <path
                    d={`M 100 100 L ${x1} ${y1} A 90 90 0 ${largeArc} 1 ${x2} ${y2} Z`}
                    fill={COLORS[i % COLORS.length]}
                  />
                )}
                <text
                  x={100 + 55 * Math.cos((startAngle + endAngle) / 2)}
                  y={100 + 55 * Math.sin((startAngle + endAngle) / 2)}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="roulette__label"
                >
                  {seg.label.slice(0, 10)}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
