import { StrictMode, type ReactNode } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { useRotation } from './useRotation'

const state = vi.hoisted(() => ({ api: vi.fn(), messages: new Set<() => void>(), connects: new Set<() => void>() }))
vi.mock('@/Shared/api/client', () => ({ apiClient: (path: string) => state.api(path) }))
vi.mock('@/Shared/websocket/socketClient', () => ({
  subscribeTopicEffect: (topic: string, handler: () => void) => {
    expect(topic).toBe('/topic/rotation')
    state.messages.add(handler)
    return () => state.messages.delete(handler)
  },
  onSocketConnect: (handler: () => void) => { state.connects.add(handler); return () => state.connects.delete(handler) },
}))
afterEach(() => { cleanup(); vi.useRealTimers(); state.api.mockReset() })

it('refreshes on changes and connections without polling and cleans up subscriptions', async () => {
  vi.useFakeTimers()
  state.api.mockResolvedValue({ version: 0, updatedAt: '2026-10-27T12:00:00Z', slots: [] })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  const wrapper = ({ children }: { children: ReactNode }) => <StrictMode><QueryClientProvider client={client}>{children}</QueryClientProvider></StrictMode>
  const { unmount } = renderHook(useRotation, { wrapper })
  await act(async () => { await vi.advanceTimersByTimeAsync(5) })
  expect(state.api).toHaveBeenCalledExactlyOnceWith('/rotation/bosses')
  expect(state.messages.size).toBe(1)
  expect(state.connects.size).toBe(1)
  await act(async () => { await vi.advanceTimersByTimeAsync(120_000) })
  expect(state.api).toHaveBeenCalledTimes(1)
  await act(async () => { state.messages.forEach(handler => handler()); await vi.advanceTimersByTimeAsync(5) })
  expect(state.api).toHaveBeenCalledTimes(2)
  await act(async () => { state.connects.forEach(handler => handler()); await vi.advanceTimersByTimeAsync(5) })
  expect(state.api).toHaveBeenCalledTimes(3)
  unmount()
  expect(state.messages.size).toBe(0)
  expect(state.connects.size).toBe(0)
  client.clear()
})
