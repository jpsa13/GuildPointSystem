import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { apiClient } from '@/Shared/api/client'
import {
  getSocketState,
  onSocketReconnect,
  sendSocketMessage,
  subscribeTopic,
  subscribeTopicEffect,
} from '@/Shared/websocket/socketClient'
import { serverNow, trackServerTime } from '@/Shared/utils/serverClock'
import { isAuctionFinished } from '@/Domain/types/models'
import type { Auction, AuctionBidResult, AuctionMessage, AuctionMessageReaction } from '@/Domain/types/models'
import { memberKeys } from '@/Domain/Member/hooks/useMembers'

export const auctionKeys = {
  all: ['auctions'] as const,
  detail: (id: number) => ['auctions', id] as const,
  messages: (id: number) => ['auctions', id, 'messages'] as const,
  tieBreak: (id: number) => ['auctions', id, 'tieBreak'] as const,
}

// ─── Server clock ─────────────────────────────────────────────────────────────
// A few seconds of skew decide whether a last-second bid lands before or after the deadline.

export { serverNow }

function trackAuctionTime(auction: Auction | null | undefined) {
  trackServerTime(auction?.serverTime)
}

// ─── Version-guarded cache writes ─────────────────────────────────────────────
// WS pushes and REST reads can arrive out of order; the higher version always wins.

function newer(old: Auction | undefined, next: Auction): Auction {
  if (old && old.id === next.id && (old.version ?? 0) > (next.version ?? 0)) return old
  return next
}

/** AUCTION_UPDATE pushes leave `items` out: they never change after creation. */
type AuctionState = Omit<Auction, 'items'> & { items: Auction['items'] | null }

/** Fills a pushed state's items from the cached auction; without one there is nothing to show yet. */
function withItems(old: Auction | undefined, next: AuctionState): Auction | undefined {
  if (next.items) return next as Auction
  return old ? { ...next, items: old.items } : undefined
}

function applyAuction(queryClient: QueryClient, auction: AuctionState) {
  trackServerTime(auction.serverTime)
  queryClient.setQueryData<Auction>(auctionKeys.detail(auction.id), (old) => {
    const full = withItems(old, auction)
    // No cached detail yet: leave it to the detail query, which fetches the full auction.
    return full ? newer(old, full) : old
  })
  queryClient.setQueryData<Auction[]>(auctionKeys.all, (old) =>
    old?.map((a) => (a.id === auction.id ? newer(a, withItems(a, auction)!) : a)),
  )
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useAuctions() {
  const queryClient = useQueryClient()

  useEffect(
    () =>
      subscribeTopicEffect('/topic/auctions', (message) => {
        const payload = JSON.parse(message.body) as { type: string; auction?: AuctionState }
        if (payload.type === 'AUCTION_UPDATE' && payload.auction) {
          const known = queryClient
            .getQueryData<Auction[]>(auctionKeys.all)
            ?.some((a) => a.id === payload.auction!.id)
          if (known) {
            applyAuction(queryClient, payload.auction)
            return
          }
        }
        queryClient.invalidateQueries({ queryKey: auctionKeys.all, exact: true })
      }),
    [queryClient],
  )

  // Bids/creations published while the socket was down never arrive — refetch on reconnect.
  useEffect(
    () => onSocketReconnect(() => queryClient.invalidateQueries({ queryKey: auctionKeys.all, exact: true })),
    [queryClient],
  )

  return useQuery({
    queryKey: auctionKeys.all,
    queryFn: () => apiClient<Auction[]>('/auctions'),
  })
}

export interface TieBreakState {
  /** Set by TIE_BREAK_RESULT: the wheel lands on this segment over `landingMs`. */
  winnerIndex: number | null
  landingMs: number
}

export function useAuction(id: number, onDeleted?: () => void) {
  const queryClient = useQueryClient()
  const onDeletedRef = useRef(onDeleted)
  useEffect(() => {
    onDeletedRef.current = onDeleted
  }, [onDeleted])

  const query = useQuery({
    queryKey: auctionKeys.detail(id),
    queryFn: async () => {
      const auction = await apiClient<Auction>(`/auctions/${id}`)
      trackAuctionTime(auction)
      return auction
    },
    enabled: id > 0,
    // Safety net for missed WS frames (server heartbeats + reconnect refetch catch dropped sockets);
    // the version guard keeps a slow response from rolling state back.
    refetchInterval: (q) => (q.state.data && !isAuctionFinished(q.state.data.status) ? 30_000 : false),
    structuralSharing: (oldData, newData) =>
      newer(oldData as Auction | undefined, newData as Auction),
  })

  useEffect(() => {
    if (id <= 0) return
    return onSocketReconnect(() => {
      queryClient.invalidateQueries({ queryKey: auctionKeys.detail(id), exact: true })
      queryClient.invalidateQueries({ queryKey: auctionKeys.messages(id), exact: true })
    })
  }, [id, queryClient])

  useEffect(() => {
    if (id <= 0) return

    return subscribeTopicEffect(`/topic/auctions/${id}`, (message) => {
      const payload = JSON.parse(message.body) as {
        type: string
        auction?: AuctionState
        message?: AuctionMessage
        messageId?: number
        reactions?: AuctionMessageReaction[]
        winnerIndex?: number
        landingMs?: number
      }

      switch (payload.type) {
        case 'AUCTION_UPDATE':
          if (payload.auction) applyAuction(queryClient, payload.auction)
          break
        case 'CHAT':
        case 'BOT':
        case 'BID':
          if (payload.message) appendMessage(queryClient, id, payload.message)
          break
        case 'REACTION':
          if (payload.messageId != null && payload.reactions) {
            setReactions(queryClient, id, payload.messageId, () => payload.reactions!)
          }
          break
        case 'TIE_BREAK_START':
        case 'TIE_BREAK_SPIN':
          queryClient.setQueryData<TieBreakState>(auctionKeys.tieBreak(id), {
            winnerIndex: null,
            landingMs: 0,
          })
          break
        case 'TIE_BREAK_RESULT':
          queryClient.setQueryData<TieBreakState>(auctionKeys.tieBreak(id), {
            winnerIndex: payload.winnerIndex ?? 0,
            landingMs: payload.landingMs ?? 5000,
          })
          break
        case 'AUCTION_CLOSED':
        case 'AUCTION_CANCELLED':
          queryClient.invalidateQueries({ queryKey: auctionKeys.all, exact: true })
          break
        case 'AUCTION_DELETED':
          onDeletedRef.current?.()
          queryClient.removeQueries({ queryKey: auctionKeys.detail(id) })
          break
      }
    })
  }, [id, queryClient])

  return query
}

export function useAuctionTieBreak(id: number) {
  return useQuery<TieBreakState | null>({
    queryKey: auctionKeys.tieBreak(id),
    queryFn: () => null,
    staleTime: Infinity,
    enabled: id > 0,
  }).data
}

function appendMessage(queryClient: QueryClient, id: number, message: AuctionMessage) {
  queryClient.setQueryData(auctionKeys.messages(id), (old: AuctionMessage[] | undefined) => {
    if (!old) return [message]
    if (old.some((m) => m.id === message.id)) return old
    // Publishes from concurrent transactions can arrive slightly out of order; ids are monotonic.
    return [...old, message].sort((a, b) => a.id - b.id)
  })
}

function setReactions(
  queryClient: QueryClient,
  auctionId: number,
  messageId: number,
  update: (reactions: AuctionMessageReaction[]) => AuctionMessageReaction[],
) {
  queryClient.setQueryData(auctionKeys.messages(auctionId), (old: AuctionMessage[] | undefined) =>
    old?.map((m) => (m.id === messageId ? { ...m, reactions: update(m.reactions ?? []) } : m)),
  )
}

/** Adds the emoji or removes it if already there; applied locally first, the REACTION push settles it. */
export function useToggleReaction(auctionId: number, me: { id: number; nickname: string } | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: number; emoji: string }) =>
      apiClient<void>(`/auctions/${auctionId}/messages/${messageId}/reactions`, {
        method: 'POST',
        body: { emoji },
      }),
    onMutate: ({ messageId, emoji }) => {
      if (!me) return
      setReactions(queryClient, auctionId, messageId, (reactions) => {
        const current = reactions.find((r) => r.emoji === emoji)
        if (!current) return [...reactions, { emoji, members: [me] }]
        const mine = current.members.some((m) => m.id === me.id)
        const members = mine ? current.members.filter((m) => m.id !== me.id) : [...current.members, me]
        return members.length === 0
          ? reactions.filter((r) => r.emoji !== emoji)
          : reactions.map((r) => (r.emoji === emoji ? { ...r, members } : r))
      })
    },
    onError: () => queryClient.invalidateQueries({ queryKey: auctionKeys.messages(auctionId), exact: true }),
  })
}

export function useAuctionMessages(id: number) {
  return useQuery({
    queryKey: auctionKeys.messages(id),
    queryFn: () => apiClient<AuctionMessage[]>(`/auctions/${id}/messages`),
    enabled: id > 0,
    refetchInterval: 60_000, // fallback for missed WS events (a reconnect also refetches)
  })
}

// ─── Bids over WebSocket ──────────────────────────────────────────────────────

const BID_REPLY_QUEUE = '/user/queue/auction-bids'
const BID_TIMEOUT_MS = 8000

const pendingBids = new Map<string, (result: AuctionBidResult) => void>()
/** Live while a component using usePlaceBid is mounted (re-created after logout/login). */
let bidQueueReady: Promise<unknown> | null = null

function useBidReplyQueue() {
  useEffect(() => {
    const subscription = subscribeTopic(BID_REPLY_QUEUE, (message) => {
      const result = JSON.parse(message.body) as AuctionBidResult
      pendingBids.get(result.requestId)?.(result)
      pendingBids.delete(result.requestId)
    })
    bidQueueReady = subscription
    return () => {
      if (bidQueueReady === subscription) bidQueueReady = null
      subscription.then((unsubscribe) => unsubscribe())
    }
  }, [])
}

function newRequestId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

async function sendBidOverSocket(id: number, amount: number): Promise<AuctionBidResult> {
  await bidQueueReady
  const requestId = newRequestId()
  return new Promise<AuctionBidResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingBids.delete(requestId)
      reject(new Error('Sem resposta do servidor para o lance. Verifique sua conexão.'))
    }, BID_TIMEOUT_MS)
    pendingBids.set(requestId, (result) => {
      clearTimeout(timer)
      resolve(result)
    })
    try {
      sendSocketMessage(`/app/auctions/${id}/bid`, { requestId, amount })
    } catch (err) {
      clearTimeout(timer)
      pendingBids.delete(requestId)
      reject(err)
    }
  })
}

export function usePlaceBid() {
  const queryClient = useQueryClient()
  useBidReplyQueue()
  return useMutation({
    mutationFn: async ({ id, amount }: { id: number; amount: number }) => {
      if (getSocketState() !== 'connected' || !bidQueueReady) {
        // REST fallback when the socket is down; errors surface the same way.
        return apiClient<Auction>(`/auctions/${id}/bids`, { method: 'POST', body: { amount } })
      }
      const result = await sendBidOverSocket(id, amount)
      if (result.auction) applyAuction(queryClient, result.auction)
      if (!result.accepted) throw new Error(result.error ?? 'Lance recusado.')
      return result.auction
    },
    onSuccess: (auction) => {
      if (auction) applyAuction(queryClient, auction)
      queryClient.invalidateQueries({ queryKey: memberKeys.me })
    },
  })
}

export function useSendAuctionMessage() {
  return useMutation({
    mutationFn: ({
      id,
      content,
      imageUrl,
      replyToId,
    }: {
      id: number
      content: string
      imageUrl?: string
      replyToId?: number
    }) =>
      apiClient<void>(`/auctions/${id}/messages`, {
        method: 'POST',
        body: { content, imageUrl, replyToId },
      }),
    // No invalidation needed — the sender receives their own WS CHAT push
    // which appends directly via setQueryData in useAuction.
  })
}

export function useCreateAuction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: {
      durationMinutes: number
      items: { itemId: number; quantity: number }[]
    }) => apiClient<Auction>('/auctions', { method: 'POST', body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: auctionKeys.all, exact: true }),
  })
}

/** Líder/Administrador: force-close an active auction (no winner; reserved points released). */
export function useCancelAuction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiClient<Auction>(`/auctions/${id}/cancel`, { method: 'POST' }),
    onSuccess: (auction) => applyAuction(queryClient, auction),
  })
}

/** Líder/Administrador: add 5 minutes to an open auction (DOLE goes back to OPEN). */
export function useExtendAuction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiClient<Auction>(`/auctions/${id}/extend`, { method: 'POST' }),
    onSuccess: (auction) => applyAuction(queryClient, auction),
  })
}

/** Líder/Administrador: delete a finished auction (points untouched). */
export function useDeleteAuction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiClient<void>(`/auctions/${id}`, { method: 'DELETE' }),
    onSuccess: (_, id) => {
      queryClient.setQueryData<Auction[]>(auctionKeys.all, (old) => old?.filter((a) => a.id !== id))
      queryClient.removeQueries({ queryKey: ['auctions', id] })
    },
  })
}

/** Global listener: every member gets a toast (item, image, link) when an auction opens. */
export function useAuctionCreatedSubscription(onCreated: (auction: Auction) => void) {
  useEffect(
    () =>
      subscribeTopicEffect('/topic/auctions', (message) => {
        const payload = JSON.parse(message.body) as { type: string; auction?: Auction }
        if (payload.type === 'AUCTION_CREATED' && payload.auction) onCreated(payload.auction)
      }),
    [onCreated],
  )
}

export function usePointsSubscription(memberId: number | undefined) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!memberId) return
    return subscribeTopicEffect(`/topic/points/${memberId}`, () => {
      queryClient.invalidateQueries({ queryKey: memberKeys.me })
      queryClient.invalidateQueries({ queryKey: memberKeys.all })
    })
  }, [memberId, queryClient])
}
