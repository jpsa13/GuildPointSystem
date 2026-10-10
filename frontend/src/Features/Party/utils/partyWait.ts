import type { PartyLfgEntry } from '@/Features/Party/Party.types'

/** Waiting time as `M:SS` under an hour, `Hh MMm` above it. */
export function formatWaiting(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/** Longest wait first (earliest join); ties keep a stable order by member id. */
export function sortByWaiting(entries: PartyLfgEntry[]): PartyLfgEntry[] {
  return [...entries].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.memberId - b.memberId,
  )
}
