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

/** Points first, then queue position; createdAt remains the unchanged waiting timer. */
export function sortByWaiting(entries: PartyLfgEntry[]): PartyLfgEntry[] {
  return [...entries].sort(
    (a, b) => (b.priorityPoints ?? 0) - (a.priorityPoints ?? 0)
      || (a.queueOrder != null && b.queueOrder != null ? a.queueOrder - b.queueOrder
        : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      || a.memberId - b.memberId,
  )
}
