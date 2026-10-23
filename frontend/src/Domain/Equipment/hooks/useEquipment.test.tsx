import { StrictMode, type ReactNode } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEquipment, useEquipmentCatalog, useEquipmentHistory, useEquipmentImportStatus, useEquipmentReviews, useEquipmentSubscription } from './useEquipment'
import type { EquipmentReview } from '../types'

const state = vi.hoisted(() => ({
  admin: true, enabled: true, reviews: [] as EquipmentReview[], api: vi.fn(),
  messages: new Set<(message: { body: string }) => void>(), connects: new Set<() => void>(),
}))
vi.mock('@/Features/Auth/contexts/AuthContext', () => ({ useAuthContext: () => ({
  hasRole: () => state.admin, user: { memberId: 1, profileComplete: state.enabled, status: 'APROVADO' },
}) }))
vi.mock('@/Shared/api/client', () => ({ apiClient: (path: string) => state.api(path) }))
vi.mock('@/Shared/websocket/socketClient', () => ({
  subscribeTopicEffect: (topic: string, handler: (message: { body: string }) => void) => {
    expect(topic).toBe('/topic/equipment')
    state.messages.add(handler)
    return () => state.messages.delete(handler)
  },
  onSocketConnect: (handler: () => void) => { state.connects.add(handler); return () => state.connects.delete(handler) },
}))

let client: QueryClient
function Wrapper({ children }: { children: ReactNode }) {
  return <StrictMode><QueryClientProvider client={client}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider></StrictMode>
}
async function settle() { await act(async () => { await vi.advanceTimersByTimeAsync(5) }) }
async function message(payload: unknown = { changed: true }) {
  await act(async () => { state.messages.forEach(handler => handler({ body: JSON.stringify(payload) })) })
  await settle()
}
function calls(path: string) { return state.api.mock.calls.filter(([url]) => url === path).length }
function pending(id: string, memberId = 1, delay = 72 * 60 * 60 * 1000): EquipmentReview {
  return { id, memberId, requestedAt: new Date().toISOString(), dueAt: new Date(Date.now() + delay).toISOString(), confirmedAt: null, status: 'PENDING', overdue: false }
}
function useQueries() {
  useEquipmentSubscription()
  return { board: useEquipment(), history: useEquipmentHistory(1, state.admin), reviews: useEquipmentReviews(),
    catalog: useEquipmentCatalog('WEAPON', '', 0, true, { race: 'CORA' }), status: useEquipmentImportStatus() }
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-23T12:00:00Z'))
  state.admin = true; state.enabled = true; state.reviews = []; state.messages.clear(); state.connects.clear()
  state.api.mockReset().mockImplementation(async (path: string) => path === '/equipment/reviews' ? state.reviews : path.includes('/catalog?')
    ? { items: [], total: 0, page: 0, size: 30 } : path.endsWith('/catalog/status') ? { imported_count: 1 } : [])
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
})
afterEach(() => { cleanup(); client.clear(); vi.useRealTimers() })

describe('equipment WebSocket updates', () => {
  it('loads once, keeps one global subscription and makes no periodic HTTP requests', async () => {
    const view = renderHook(useQueries, { wrapper: Wrapper })
    await settle()
    expect(state.api).toHaveBeenCalledTimes(5)
    expect(state.messages.size).toBe(1)
    expect(state.connects.size).toBe(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(90_000) })
    expect(state.api).toHaveBeenCalledTimes(5)
    await message()
    expect(calls('/equipment')).toBe(2)
    expect(calls('/equipment/reviews')).toBe(2)
    expect(calls('/equipment/members/1/history')).toBe(2)
    expect(calls('/equipment/catalog/status')).toBe(1)
    expect(state.api.mock.calls.filter(([path]) => path.includes('/catalog?'))).toHaveLength(1)
    view.unmount()
    expect(state.messages.size).toBe(0)
    expect(state.connects.size).toBe(0)
  })
  it('refreshes after the first connection and reconnections, including catalog caches', async () => {
    renderHook(useQueries, { wrapper: Wrapper }); await settle()
    for (let connection = 1; connection <= 2; connection++) {
      await act(async () => { state.connects.forEach(handler => handler()) }); await settle()
      expect(calls('/equipment')).toBe(connection + 1)
      expect(calls('/equipment/reviews')).toBe(connection + 1)
      expect(calls('/equipment/members/1/history')).toBe(connection + 1)
      expect(calls('/equipment/catalog/status')).toBe(connection + 1)
    }
  })
  it('refreshes catalog queries only for catalog events, and reuses cached filters', async () => {
    renderHook(useEquipmentSubscription, { wrapper: Wrapper })
    const view = renderHook(({ page }) => useEquipmentCatalog('WEAPON', '', page, true, { race: 'CORA', weaponType: 0 }), { initialProps: { page: 0 }, wrapper: Wrapper })
    await settle()
    expect(state.api.mock.calls[0][0]).toContain('weaponType=0')
    view.rerender({ page: 1 }); await settle()
    view.rerender({ page: 0 }); await settle()
    expect(state.api).toHaveBeenCalledTimes(2)
    await message()
    expect(state.api).toHaveBeenCalledTimes(2)
    await message({ changed: true, catalogChanged: true })
    expect(state.api).toHaveBeenCalledTimes(3)
  })
  it('does not request private history or refresh private logs for a member', async () => {
    state.admin = false
    client.setQueryData(['logs', 'admin'], [])
    renderHook(useQueries, { wrapper: Wrapper }); await settle(); await message()
    expect(calls('/equipment/members/1/history')).toBe(0)
    expect(client.getQueryState(['logs', 'admin'])?.isInvalidated).toBe(false)
    expect(calls('/equipment/reviews')).toBe(2)
  })
  it('does not subscribe before the profile is approved and complete', async () => {
    state.enabled = false
    renderHook(() => { useEquipmentSubscription(); return useEquipmentReviews() }, { wrapper: Wrapper })
    await settle()
    expect(state.messages.size).toBe(0)
    expect(state.connects.size).toBe(0)
    expect(state.api).not.toHaveBeenCalled()
  })
  it('receives reviews through the global subscription, expires locally and accepts confirmation', async () => {
    const view = renderHook(() => { useEquipmentSubscription(); return useEquipmentReviews() }, { wrapper: Wrapper }); await settle()
    expect(view.result.current.data).toEqual([])
    state.reviews = [pending('request')]
    await message()
    expect(view.result.current.data?.[0].status).toBe('PENDING')
    const requests = state.api.mock.calls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(72 * 60 * 60 * 1000) })
    expect(view.result.current.data?.[0].status).toBe('OVERDUE')
    expect(state.api).toHaveBeenCalledTimes(requests)
    state.reviews = [{ ...state.reviews[0], confirmedAt: new Date().toISOString(), status: 'CONFIRMED' }]
    await message()
    expect(view.result.current.data?.[0].status).toBe('CONFIRMED')
  })
  it('updates successive deadlines and respects an overdue status received from the server', async () => {
    state.reviews = [pending('first', 1, 1000), pending('second', 2, 2000), { ...pending('server', 3), overdue: true, status: 'OVERDUE' }]
    const view = renderHook(useEquipmentReviews, { wrapper: Wrapper }); await settle()
    expect(view.result.current.data?.map(r => r.overdue)).toEqual([false, false, true])
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(view.result.current.data?.map(r => r.overdue)).toEqual([true, false, true])
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(view.result.current.data?.map(r => r.overdue)).toEqual([true, true, true])
    expect(state.api).toHaveBeenCalledTimes(1)
  })
})
