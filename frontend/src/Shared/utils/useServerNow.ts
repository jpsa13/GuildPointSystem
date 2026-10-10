import { useEffect, useState } from 'react'
import { serverNow } from '@/Shared/utils/serverClock'

/** Current server time, refreshed every `intervalMs` — re-renders only the component using it. */
export function useServerNow(intervalMs = 1000) {
  const [now, setNow] = useState(serverNow)
  useEffect(() => {
    const timer = setInterval(() => setNow(serverNow()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}
