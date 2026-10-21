import { useEffect, useState } from 'react'

/** Acesso antecipado premium: sem monstros e com taxas de PT reduzidas (horário de Brasília). */
export const CERBERUS_PREMIUM_ACCESS = new Date('2026-10-24T07:00:00-03:00')

/** Abertura oficial para todos, com início do aparecimento dos monstros (horário de Brasília). */
export const CERBERUS_LAUNCH = new Date('2026-10-24T09:00:00-03:00')

/** setTimeout overflows above ~24.8 days; longer waits re-arm. */
const MAX_TIMEOUT_MS = 2 ** 31 - 1

/** True once the server has opened; flips at the exact moment so the banner can go away. */
export function useCerberusLaunched(): boolean {
  const [launched, setLaunched] = useState(() => Date.now() >= CERBERUS_LAUNCH.getTime())

  useEffect(() => {
    if (launched) return
    let id: number
    const arm = () => {
      const remaining = CERBERUS_LAUNCH.getTime() - Date.now()
      if (remaining <= 0) {
        setLaunched(true)
        return
      }
      id = window.setTimeout(arm, Math.min(remaining, MAX_TIMEOUT_MS))
    }
    arm()
    return () => window.clearTimeout(id)
  }, [launched])

  return launched
}
