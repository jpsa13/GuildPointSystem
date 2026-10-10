// Timers (auction countdowns, waiting-list durations) follow the server clock, not the viewer's:
// a few seconds of skew between machines would otherwise show different values to each member.

let serverOffsetMs = 0

/** Call with the `serverTime` of any fresh server response. */
export function trackServerTime(serverTime: string | null | undefined) {
  if (!serverTime) return
  const parsed = new Date(serverTime).getTime()
  if (!Number.isNaN(parsed)) serverOffsetMs = parsed - Date.now()
}

export function serverNow() {
  return Date.now() + serverOffsetMs
}
