import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const HOUR = 60 * 60 * 1000

function token(expMs: number, sub = '7'): string {
  const b64url = (v: object) => btoa(JSON.stringify(v)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${b64url({ alg: 'HS256' })}.${b64url({ sub, exp: Math.floor(expMs / 1000) })}.sig`
}

function jsonResponse(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/** Fresh module state (renewal flags) for every test. */
async function loadClient() {
  vi.resetModules()
  const client = await import('./client')
  const session = await import('./session')
  return { ...client, ...session }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('apiClient session handling', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    localStorage.clear()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('drops the stored login and announces it when the server answers 401', async () => {
    const { apiClient, setToken, getToken, onSessionExpired } = await loadClient()
    setToken(token(Date.now() + 20 * HOUR))
    const expired = vi.fn()
    onSessionExpired(expired)
    fetchMock.mockResolvedValue(jsonResponse(401, { message: 'Não autorizado.' }))

    await expect(apiClient('/members/me')).rejects.toMatchObject({ status: 401 })
    expect(getToken()).toBeNull()
    expect(expired).toHaveBeenCalledTimes(1)
  })

  it('a wrong password on login is not an expired session', async () => {
    const { apiClient, onSessionExpired } = await loadClient()
    const expired = vi.fn()
    onSessionExpired(expired)
    fetchMock.mockResolvedValue(jsonResponse(401, { message: 'Email ou senha incorretos.' }))

    await expect(apiClient('/auth/login', { method: 'POST', body: {} })).rejects.toMatchObject({ status: 401 })
    expect(expired).not.toHaveBeenCalled()
  })

  it('renews a token close to expiry in the background, once for concurrent calls', async () => {
    const { apiClient, setToken, getToken } = await loadClient()
    const old = token(Date.now() + 2 * HOUR)
    const renewed = token(Date.now() + 24 * HOUR)
    setToken(old)
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(url.endsWith('/auth/refresh') ? jsonResponse(200, { token: renewed }) : jsonResponse(200, [])),
    )

    await Promise.all([apiClient('/events'), apiClient('/auctions'), apiClient('/parties/board')])
    await flush()

    const refreshCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh'))
    expect(refreshCalls).toHaveLength(1)
    expect(refreshCalls[0][1].headers.Authorization).toBe(`Bearer ${old}`)
    expect(getToken()).toBe(renewed)
  })

  it('leaves a fresh token alone', async () => {
    const { apiClient, setToken } = await loadClient()
    setToken(token(Date.now() + 23 * HOUR))
    fetchMock.mockResolvedValue(jsonResponse(200, []))

    await apiClient('/events')
    await flush()
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/auth/refresh'))).toBe(false)
  })

  it('does not overwrite a login that happened while renewing', async () => {
    const { apiClient, setToken, getToken } = await loadClient()
    setToken(token(Date.now() + 2 * HOUR))
    let finishRefresh: (r: Response) => void = () => {}
    fetchMock.mockImplementation((url: string) =>
      url.endsWith('/auth/refresh')
        ? new Promise<Response>((resolve) => (finishRefresh = resolve))
        : Promise.resolve(jsonResponse(200, [])),
    )

    await apiClient('/events')
    const newLogin = token(Date.now() + 24 * HOUR, '9')
    setToken(newLogin)
    finishRefresh(jsonResponse(200, { token: token(Date.now() + 24 * HOUR) }))
    await flush()
    expect(getToken()).toBe(newLogin)
  })
})
