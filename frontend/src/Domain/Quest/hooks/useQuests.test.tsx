import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useQuests } from './useQuests'
const state = vi.hoisted(() => ({ memberId: 1, api: vi.fn(), messages: new Set<() => void>(), connects: new Set<() => void>() }))
vi.mock('@/Features/Auth/contexts/AuthContext', () => ({ useAuthContext: () => ({ user: { memberId: state.memberId, profileComplete: true, status: 'APROVADO' } }) }))
vi.mock('@/Shared/api/client', () => ({ apiClient: (path: string) => state.api(path) }))
vi.mock('@/Shared/websocket/socketClient', () => ({
  subscribeTopicEffect: (topic: string, handler: () => void) => {
    expect([`/topic/quests/member/${state.memberId}`, '/topic/quests/catalog']).toContain(topic)
    const callback = () => handler()
    state.messages.add(callback); return () => state.messages.delete(callback)
  },
  onSocketConnect: (handler: () => void) => { state.connects.add(handler); return () => state.connects.delete(handler) },
}))
afterEach(() => { cleanup(); vi.useRealTimers(); state.memberId = 1; state.api.mockReset(); state.messages.clear(); state.connects.clear() })
describe('private quest cache', () => {
  it('refreshes automatically even when no websocket message arrives', async () => {
    vi.useFakeTimers()
    state.api.mockResolvedValue({ events: [], sessions: [], memberId: 1, hasMore: false })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    function Wrapper({ children }: { children: ReactNode }) { return <QueryClientProvider client={client}>{children}</QueryClientProvider> }
    const view = renderHook(() => useQuests('2026-10-26', true), { wrapper: Wrapper })
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })
    expect(view.result.current.isSuccess).toBe(true)
    const before = state.api.mock.calls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(state.api.mock.calls.length).toBeGreaterThan(before)
    view.unmount(); client.clear()
  })
  it('recovers HTTP on reconnect and separates accounts', async () => {
    state.api.mockImplementation(async () => ({ events: [], sessions: [], memberId: state.memberId, hasMore: false }))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    function Wrapper({ children }: { children: ReactNode }) { return <QueryClientProvider client={client}>{children}</QueryClientProvider> }
    const view = renderHook(() => useQuests('2026-10-23', true), { wrapper: Wrapper })
    await waitFor(() => expect(view.result.current.isSuccess).toBe(true))
    expect(state.api).toHaveBeenCalledTimes(1)
    await act(async () => { state.connects.forEach(handler => handler()) })
    await waitFor(() => expect(state.api).toHaveBeenCalledTimes(2))
    await act(async () => { state.messages.values().next().value?.() })
    await waitFor(() => expect(state.api).toHaveBeenCalledTimes(3))
    state.memberId = 2; view.rerender()
    await waitFor(() => expect(view.result.current.data?.pages[0].memberId).toBe(2))
    expect(state.messages.size).toBe(2)
    expect(state.connects.size).toBe(1)
    view.unmount(); expect(state.messages.size).toBe(0); expect(state.connects.size).toBe(0)
    client.clear()
  })
})
