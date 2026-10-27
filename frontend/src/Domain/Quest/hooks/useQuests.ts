import { useEffect } from 'react'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthContext } from '@/Features/Auth/contexts/AuthContext'
import { apiClient } from '@/Shared/api/client'
import { onSocketConnect, subscribeTopicEffect } from '@/Shared/websocket/socketClient'
import type { QuestHistory, QuestPairing } from '../types'

export function useQuests(day: string, resetPeriod: boolean) {
  const { user } = useAuthContext()
  const queries = useQueryClient()
  const memberId = user?.memberId
  const enabled = !!memberId && user?.status === 'APROVADO' && user.profileComplete
  useEffect(() => {
    if (!enabled) return
    const refresh = () => { void queries.invalidateQueries({ queryKey: ['quests', memberId] }) }
    const unsubscribe = subscribeTopicEffect(`/topic/quests/member/${memberId}`, refresh)
    const catalog = subscribeTopicEffect('/topic/quests/catalog', refresh)
    const reconnect = onSocketConnect(refresh)
    return () => { unsubscribe(); catalog(); reconnect() }
  }, [queries, memberId, enabled])
  return useInfiniteQuery({
    queryKey: ['quests', memberId, day, resetPeriod], enabled: enabled && !!day,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => apiClient<QuestHistory>(`/quests?${new URLSearchParams({ day, resetPeriod: String(resetPeriod), offset: String(pageParam) })}`),
    getNextPageParam: last => last.hasMore ? last.nextOffset : undefined,
    staleTime: 10_000,
    refetchInterval: 10_000,
  })
}
export function useLiveQuestPairing() {
  const queries = useQueryClient()
  return useMutation({ mutationFn: (expectedName: string) => apiClient<QuestPairing>('/quests/live/sessions', {
    method: 'POST', body: { monitorVersion: 'local-0.2', expectedName } }),
    onSuccess: () => queries.invalidateQueries({ queryKey: ['quests'] }) })
}
export function useQuestVisibility() {
  const queries = useQueryClient()
  return useMutation({ mutationFn: ({ hash, hidden }: { hash: string; hidden: boolean }) => apiClient(`/quests/catalog/${hash}/visibility`, { method: 'PATCH', body: { hidden } }),
    onSuccess: () => queries.invalidateQueries({ queryKey: ['quests'] }) })
}
export function useQuestPairing() {
  const queries = useQueryClient()
  return useMutation({ mutationFn: () => apiClient<QuestPairing>('/quests/sessions', { method: 'POST', body: { monitorVersion: 'replay-0.1' } }),
    onSuccess: () => queries.invalidateQueries({ queryKey: ['quests'] }) })
}
export function useQuestRevoke() {
  const queries = useQueryClient()
  return useMutation({ mutationFn: (id: string) => apiClient(`/quests/sessions/${id}`, { method: 'DELETE' }),
    onSuccess: () => queries.invalidateQueries({ queryKey: ['quests'] }) })
}
