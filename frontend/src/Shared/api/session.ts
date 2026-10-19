/** Renew the login once less than this is left (tokens last 24h): active members never get logged out. */
export const RENEW_WHEN_REMAINING_MS = 12 * 60 * 60 * 1000
/** After a failed renewal, wait before trying again (the next API call would otherwise retry at once). */
export const RENEW_RETRY_MS = 60 * 1000

/** Expiry (epoch ms) read from the JWT payload, or null if the token can't be read. */
export function tokenExpiresAt(token: string): number | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number }
    return typeof json.exp === 'number' ? json.exp * 1000 : null
  } catch {
    return null
  }
}

/** Still valid but within the renewal window. Expired tokens are not renewed: that is a real logout. */
export function shouldRenew(token: string, now: number): boolean {
  const expiresAt = tokenExpiresAt(token)
  if (expiresAt == null) return false
  const remaining = expiresAt - now
  return remaining > 0 && remaining < RENEW_WHEN_REMAINING_MS
}

const expiredListeners = new Set<() => void>()

/** Fires when the server rejects the stored token (expired, revoked, account removed). */
export function onSessionExpired(listener: () => void): () => void {
  expiredListeners.add(listener)
  return () => {
    expiredListeners.delete(listener)
  }
}

export function notifySessionExpired() {
  expiredListeners.forEach((listener) => listener())
}
