import { formatApiError } from '@/Shared/utils/formatApiError'
import { getApiBaseUrl } from '@/Shared/utils/env'

const API_BASE = getApiBaseUrl()
const TOKEN_KEY = 'guild_points_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token)
  } else {
    localStorage.removeItem(TOKEN_KEY)
  }
}

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

type RequestOptions = Omit<RequestInit, 'body'> & { body?: unknown }

export async function apiClient<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body: payload, headers, method = 'GET', ...rest } = options
  const token = getToken()

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    ...rest,
    headers: {
      ...(payload !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: payload !== undefined ? JSON.stringify(payload) : undefined,
  })

  if (!response.ok) {
    let message = response.statusText
    try {
      const err = (await response.json()) as { message?: string; error?: string }
      if (err.message) message = err.message
      else if (err.error) message = err.error
    } catch {
      /* ignore */
    }
    throw new ApiError(formatApiError(message), response.status)
  }

  // No body (204, or e.g. a 201 from a void endpoint): parsing would throw on success.
  const text = await response.text()
  if (!text) {
    return undefined as T
  }

  return JSON.parse(text) as T
}

export { API_BASE }
