import { useEffect, useState } from 'react'
import { serverNow } from '@/Domain/Auction/hooks/useAuction'

/** Seconds left until `endsAt`, on the server clock. */
export function useCountdown(endsAt: string) {
  const [remaining, setRemaining] = useState(0)
  useEffect(() => {
    if (!endsAt) return
    const tick = () => {
      setRemaining(Math.max(0, Math.ceil((new Date(endsAt).getTime() - serverNow()) / 1000)))
    }
    tick()
    const timer = setInterval(tick, 200)
    return () => clearInterval(timer)
  }, [endsAt])
  return remaining
}

export function formatTime(seconds: number) {
  if (seconds <= 0) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = (seconds % 60).toString().padStart(2, '0')
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s}`
  return `${m}:${s}`
}
