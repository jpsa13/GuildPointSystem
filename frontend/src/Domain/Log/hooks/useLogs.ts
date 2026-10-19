import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { apiClient } from '@/Shared/api/client'
import { onSocketReconnect, subscribeTopic, subscribeTopicEffect } from '@/Shared/websocket/socketClient'
import { eventKeys, mergeEventIntoCache } from '@/Domain/Event/hooks/useEvents'
import { memberKeys } from '@/Domain/Member/hooks/useMembers'
import { getPayloadClaimId, markClaimDeniedInPage } from '@/Domain/Log/utils/logClaimUtils'
import { useAppToast } from '@/Shared/ui/components/AppToast/AppToast'
import type { AuditLogEntry, GuildEvent, Page } from '@/Domain/types/models'

const logKeys = {
  all: ['logs'] as const,
}

export function useLogs(page = 0, size = 50) {
  return useQuery({
    queryKey: [...logKeys.all, page, size],
    queryFn: () => apiClient<Page<AuditLogEntry>>(`/logs?page=${page}&size=${size}`),
  })
}

/**
 * Applies a broadcast log without a refetch: with hundreds of members claiming one event, refetching
 * on every log would turn each claim into one GET /logs per connected client.
 */
function applyLogToCache(queryClient: QueryClient, log: AuditLogEntry) {
  queryClient.setQueriesData<Page<AuditLogEntry>>({ queryKey: logKeys.all }, (old) => {
    if (!old || old.number !== 0 || old.content.some((l) => l.id === log.id)) return old
    const totalElements = old.totalElements + 1
    return {
      ...old,
      content: [log, ...old.content].slice(0, old.size),
      totalElements,
      totalPages: Math.ceil(totalElements / old.size),
    }
  })

  if (log.type === 'EVENT_DENIED') {
    const claimId = getPayloadClaimId(log.payload)
    if (claimId !== null) {
      queryClient.setQueriesData<Page<AuditLogEntry>>({ queryKey: logKeys.all }, (old) =>
        markClaimDeniedInPage(old, claimId),
      )
    }
  }

  // Older pages shifted by one entry: refresh them when next viewed, not now.
  queryClient.invalidateQueries({
    queryKey: logKeys.all,
    predicate: (q) => (q.state.data as Page<AuditLogEntry> | undefined)?.number !== 0,
    refetchType: 'none',
  })
}

export function useLogsSubscription() {
  const queryClient = useQueryClient()

  useEffect(
    () =>
      subscribeTopicEffect('/topic/logs', (message) => {
        try {
          applyLogToCache(queryClient, JSON.parse(message.body) as AuditLogEntry)
        } catch {
          queryClient.invalidateQueries({ queryKey: logKeys.all })
        }
      }),
    [queryClient],
  )

  // Logs published while the socket was down never arrive — refetch on reconnect.
  useEffect(
    () => onSocketReconnect(() => queryClient.invalidateQueries({ queryKey: logKeys.all })),
    [queryClient],
  )
}

/** Toast + balance refresh when this member's event claim is denied. */
export function useMemberLogNotifications(memberId: number | undefined) {
  const queryClient = useQueryClient()
  const { showToast } = useAppToast()
  const seenDeniedLogIds = useRef(new Set<number>())

  useEffect(() => {
    if (!memberId) return
    let cancelled = false
    let unsubscribe: (() => void) | undefined

    subscribeTopic('/topic/logs', (message) => {
      try {
        const log = JSON.parse(message.body) as AuditLogEntry
        if (log.type !== 'EVENT_DENIED' || log.targetId !== memberId) return
        if (seenDeniedLogIds.current.has(log.id)) return
        seenDeniedLogIds.current.add(log.id)

        const objectiveName = String(log.payload.objectiveName ?? '')
        const reason = String(log.payload.reason ?? '')
        const points = String(log.payload.pointsReverted ?? '')
        if (objectiveName && reason) {
          showToast(
            `Seu resgate do evento "${objectiveName}" foi removido. Motivo: ${reason} (-${points} pts)`,
            'error',
          )
          queryClient.invalidateQueries({ queryKey: memberKeys.me })
          queryClient.invalidateQueries({ queryKey: memberKeys.all })
        }
      } catch {
        // ignore malformed payloads
      }
    }).then((fn) => {
      if (cancelled) {
        fn()
      } else {
        unsubscribe = fn
      }
    })

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [memberId, queryClient, showToast])
}

export function useEventSubscription(onEvent?: (event: GuildEvent) => void) {
  const queryClient = useQueryClient()

  // Creations/cancellations published while the socket was down never arrive — refetch on reconnect.
  useEffect(
    () => onSocketReconnect(() => queryClient.invalidateQueries({ queryKey: eventKeys.active })),
    [queryClient],
  )

  useEffect(() => {
    let cancelled = false
    let unsubscribe: (() => void) | undefined

    subscribeTopic('/topic/events', (message) => {
      let parsed: unknown
      try {
        parsed = JSON.parse(message.body)
      } catch {
        return
      }
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        !('id' in parsed) ||
        !('active' in parsed)
      ) {
        return
      }
      // claimedByMe is per member and a broadcast can't know it — keep what this client already has.
      const known = queryClient.getQueryData<GuildEvent[]>(eventKeys.active)?.find((e) => e.id === parsed.id)
      const event = { ...(parsed as GuildEvent), claimedByMe: known?.claimedByMe ?? false }
      // The payload is the full event: apply it directly, no refetch fan-out across every client.
      mergeEventIntoCache(queryClient, event)
      onEvent?.(event)
    }).then((fn) => {
      if (cancelled) {
        fn()
      } else {
        unsubscribe = fn
      }
    })

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [queryClient, onEvent])
}

export type { AuditLogEntry }
