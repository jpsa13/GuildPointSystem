import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/Shared/api/client'
import type { AuditLogEntry, GuildEvent, Page } from '@/Domain/types/models'
import { markClaimDeniedInPage } from '@/Domain/Log/utils/logClaimUtils'
import { memberKeys } from '@/Domain/Member/hooks/useMembers'

export const eventKeys = {
  active: ['events', 'active'] as const,
}

export function useActiveEvents() {
  return useQuery({
    queryKey: eventKeys.active,
    queryFn: () => apiClient<GuildEvent[]>('/events'),
    refetchInterval: 15_000,
  })
}

function mergeEventIntoCache(
  queryClient: ReturnType<typeof useQueryClient>,
  event: GuildEvent,
) {
  queryClient.setQueryData<GuildEvent[]>(eventKeys.active, (old = []) => {
    if (!event.active) {
      return old.filter((e) => e.id !== event.id)
    }
    const idx = old.findIndex((e) => e.id === event.id)
    if (idx >= 0) {
      const next = [...old]
      next[idx] = event
      return next
    }
    return [event, ...old]
  })
}

function removeEventFromCache(
  queryClient: ReturnType<typeof useQueryClient>,
  eventId: number,
) {
  queryClient.setQueryData<GuildEvent[]>(eventKeys.active, (old = []) =>
    old.filter((e) => e.id !== eventId),
  )
}

export function useCreateEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { objectiveId: number; durationMinutes: number; password: string }) =>
      apiClient<GuildEvent>('/events', { method: 'POST', body }),
    onSuccess: (event) => {
      mergeEventIntoCache(queryClient, event)
      queryClient.invalidateQueries({ queryKey: eventKeys.active })
    },
  })
}

export function useCancelEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiClient<GuildEvent>(`/events/${id}/cancel`, { method: 'POST' }),
    onSuccess: (event) => {
      removeEventFromCache(queryClient, event.id)
      queryClient.invalidateQueries({ queryKey: eventKeys.active })
      queryClient.invalidateQueries({ queryKey: ['logs'] })
    },
  })
}

export { mergeEventIntoCache, removeEventFromCache }

export function useClaimEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, password }: { id: number; password: string }) =>
      apiClient<GuildEvent>(`/events/${id}/claim`, { method: 'POST', body: { password } }),
    onSuccess: (event) => {
      mergeEventIntoCache(queryClient, event)
      queryClient.invalidateQueries({ queryKey: eventKeys.active })
      queryClient.invalidateQueries({ queryKey: memberKeys.all })
    },
  })
}

export function useDenyEventClaim() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ claimId, reason }: { claimId: number; reason: string }) =>
      apiClient<void>(`/events/claims/${claimId}/deny`, {
        method: 'POST',
        body: { reason },
      }),
    onSuccess: (_, { claimId }) => {
      queryClient.setQueriesData<Page<AuditLogEntry>>({ queryKey: ['logs'] }, (old) =>
        markClaimDeniedInPage(old, claimId),
      )
      queryClient.invalidateQueries({ queryKey: ['logs'] })
      queryClient.invalidateQueries({ queryKey: memberKeys.all })
      queryClient.invalidateQueries({ queryKey: ['members'] })
    },
  })
}
