import { describe, expect, it } from 'vitest'
import { RENEW_WHEN_REMAINING_MS, shouldRenew, tokenExpiresAt } from './session'

const HOUR = 60 * 60 * 1000

/** Unsigned JWT-shaped token: only the payload matters client-side. */
function token(expMs: number): string {
  const b64url = (v: object) => btoa(JSON.stringify(v)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${b64url({ alg: 'HS256' })}.${b64url({ sub: '7', exp: Math.floor(expMs / 1000) })}.sig`
}

describe('tokenExpiresAt', () => {
  it('reads exp from the payload', () => {
    const exp = Date.UTC(2026, 9, 20, 12, 0, 0)
    expect(tokenExpiresAt(token(exp))).toBe(exp)
  })

  it('returns null for anything unreadable', () => {
    expect(tokenExpiresAt('garbage')).toBeNull()
    expect(tokenExpiresAt('a.b.c')).toBeNull()
  })
})

describe('shouldRenew', () => {
  const now = Date.UTC(2026, 9, 20, 12, 0, 0)

  it('renews inside the window only', () => {
    expect(shouldRenew(token(now + 20 * HOUR), now)).toBe(false)
    expect(shouldRenew(token(now + RENEW_WHEN_REMAINING_MS - HOUR), now)).toBe(true)
    expect(shouldRenew(token(now + 5 * 60 * 1000), now)).toBe(true)
  })

  it('does not renew an expired or unreadable token', () => {
    expect(shouldRenew(token(now - 1000), now)).toBe(false)
    expect(shouldRenew('garbage', now)).toBe(false)
  })
})
