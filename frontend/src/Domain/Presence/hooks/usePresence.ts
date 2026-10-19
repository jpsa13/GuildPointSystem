import { useCallback, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/Shared/api/client'
import {
  getSocketTransport,
  onSocketConnect,
  onSocketReconnect,
  sendSocketMessage,
  subscribeTopicEffect,
} from '@/Shared/websocket/socketClient'
import { trackServerTime } from '@/Shared/utils/serverClock'
import { pageFromPath } from '@/Domain/Presence/presencePages'

export interface OnlineMember {
  memberId: number
  nickname: string
  className: string | null
  classImageUrl: string | null
  page: string
  detail: string | null
  transport: 'websocket' | 'sockjs' | null
  /** Last measured round trip browser → server → browser, in ms. */
  rttMs: number | null
  /** Tab is in the background. */
  hidden: boolean
  onlineSince: string
  tabs: number
}

export interface PresenceSnapshot {
  members: OnlineMember[]
  serverTime: string
}

export const presenceKeys = {
  online: ['presence', 'online'] as const,
}

const PING_INTERVAL_MS = 15_000
/** Pongs that never came back are forgotten after this long. */
const PENDING_PING_TTL_MS = 60_000

/**
 * Tells the server which page this tab is on (on every navigation and every 15s) and measures the real
 * round trip over the socket: the server echoes each report's id back to this tab only.
 */
export function usePresenceReporter(enabled: boolean) {
  const { pathname } = useLocation()
  const pathnameRef = useRef(pathname)
  const lastRttRef = useRef<number | null>(null)
  const pendingRef = useRef(new Map<string, number>())

  useEffect(() => {
    pathnameRef.current = pathname
  }, [pathname])

  const report = useCallback(() => {
    const { page, detail } = pageFromPath(pathnameRef.current)
    const pingId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    const now = performance.now()
    for (const [id, sentAt] of pendingRef.current) {
      if (now - sentAt > PENDING_PING_TTL_MS) pendingRef.current.delete(id)
    }
    try {
      sendSocketMessage('/app/presence', {
        pingId,
        page,
        detail,
        transport: getSocketTransport(),
        rttMs: lastRttRef.current,
        hidden: document.visibilityState === 'hidden',
      })
      pendingRef.current.set(pingId, now)
    } catch {
      // Socket down: onSocketConnect reports again as soon as it is back.
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    return subscribeTopicEffect('/user/queue/presence-pong', (message) => {
      const { pingId } = JSON.parse(message.body) as { pingId?: string }
      const sentAt = pingId ? pendingRef.current.get(pingId) : undefined
      if (pingId == null || sentAt == null) return
      pendingRef.current.delete(pingId)
      const firstMeasurement = lastRttRef.current == null
      lastRttRef.current = Math.round(performance.now() - sentAt)
      // Show the ping on the panel right away instead of on the next 15s tick.
      if (firstMeasurement) report()
    })
  }, [enabled, report])

  useEffect(() => {
    if (enabled) report()
  }, [enabled, pathname, report])

  useEffect(() => {
    if (!enabled) return
    const timer = window.setInterval(report, PING_INTERVAL_MS)
    document.addEventListener('visibilitychange', report)
    const offConnect = onSocketConnect(report)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', report)
      offConnect()
    }
  }, [enabled, report])
}

function newer(old: PresenceSnapshot | undefined, next: PresenceSnapshot): PresenceSnapshot {
  if (old && new Date(old.serverTime) > new Date(next.serverTime)) return old
  return next
}

/** Leadership panel: initial REST snapshot, then live pushes on /topic/presence (at most one per second). */
export function useOnlineMembers() {
  const queryClient = useQueryClient()

  useEffect(
    () =>
      subscribeTopicEffect('/topic/presence', (message) => {
        const snapshot = JSON.parse(message.body) as PresenceSnapshot
        trackServerTime(snapshot.serverTime)
        queryClient.setQueryData<PresenceSnapshot>(presenceKeys.online, (old) => newer(old, snapshot))
      }),
    [queryClient],
  )

  useEffect(
    () => onSocketReconnect(() => queryClient.invalidateQueries({ queryKey: presenceKeys.online, exact: true })),
    [queryClient],
  )

  return useQuery({
    queryKey: presenceKeys.online,
    queryFn: async () => {
      const snapshot = await apiClient<PresenceSnapshot>('/presence')
      trackServerTime(snapshot.serverTime)
      return snapshot
    },
    structuralSharing: (oldData, newData) =>
      newer(oldData as PresenceSnapshot | undefined, newData as PresenceSnapshot),
  })
}
