import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/Shared/api/client'
import { onSocketReconnect, subscribeTopicEffect } from '@/Shared/websocket/socketClient'
import { trackServerTime } from '@/Shared/utils/serverClock'
import type { PartyBoard, PartyMap, PartyMemberNotice } from '@/Features/Party/Party.types'
import {
  applyPublicBoard,
  needsPersonalRefetch,
  parsePartyBoardUpdate,
} from '@/Features/Party/utils/partyBoardUpdate'

export const partyKeys = {
  board: ['party', 'board'] as const,
}

/**
 * Board snapshots come from mutation responses and from WS-triggered refetches, in any order.
 * Keep whichever the server generated last, so a slow response never rolls the screen back.
 */
function newerBoard(old: PartyBoard | undefined, next: PartyBoard): PartyBoard {
  if (old?.serverTime && next.serverTime && new Date(old.serverTime) > new Date(next.serverTime)) return old
  return next
}

function setBoard(queryClient: ReturnType<typeof useQueryClient>, data: PartyBoard) {
  trackServerTime(data.serverTime)
  queryClient.setQueryData<PartyBoard>(partyKeys.board, (old) => newerBoard(old, data))
}

export function usePartyBoard() {
  const queryClient = useQueryClient()

  // The server broadcasts the public board (built once, after commit). Each client applies it and derives
  // its own PT from it; only members whose pending invites/requests changed refetch their personal view.
  useEffect(
    () =>
      subscribeTopicEffect('/topic/parties', (message) => {
        const update = parsePartyBoardUpdate(message.body)
        const old = queryClient.getQueryData<PartyBoard>(partyKeys.board)
        if (update?.board && old) setBoard(queryClient, applyPublicBoard(old, update.board))
        if (!update || needsPersonalRefetch(old, update)) {
          queryClient.invalidateQueries({ queryKey: partyKeys.board, exact: true })
        }
      }),
    [queryClient],
  )

  // Changes published while the socket was down never arrive — refetch on reconnect.
  useEffect(
    () => onSocketReconnect(() => queryClient.invalidateQueries({ queryKey: partyKeys.board, exact: true })),
    [queryClient],
  )

  return useQuery({
    queryKey: partyKeys.board,
    queryFn: async () => {
      const board = await apiClient<PartyBoard>('/parties/board')
      trackServerTime(board.serverTime)
      return board
    },
    structuralSharing: (oldData, newData) =>
      newerBoard(oldData as PartyBoard | undefined, newData as PartyBoard),
  })
}

export function useCreateParty() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { map: PartyMap; spot?: string }) =>
      apiClient<PartyBoard>('/parties', { method: 'POST', body }),
    onSuccess: (data) => setBoard(queryClient, data),
  })
}

export function useDisbandParty() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (partyId: number) =>
      apiClient<PartyBoard>(`/parties/${partyId}`, { method: 'DELETE' }),
    onSuccess: (data) => setBoard(queryClient, data),
  })
}

export function useLeaveParty() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (partyId: number) =>
      apiClient<PartyBoard>(`/parties/${partyId}/leave`, { method: 'POST' }),
    onSuccess: (data) => setBoard(queryClient, data),
  })
}

export function useRequestJoinParty() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (partyId: number) =>
      apiClient<PartyBoard>(`/parties/${partyId}/requests`, { method: 'POST' }),
    onSuccess: (data) => setBoard(queryClient, data),
  })
}

export function useInviteToParty() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ partyId, memberId }: { partyId: number; memberId: number }) =>
      apiClient<PartyBoard>(`/parties/${partyId}/invites`, {
        method: 'POST',
        body: { memberId },
      }),
    onSuccess: (data) => setBoard(queryClient, data),
  })
}

export function useAcceptPartyPending() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (pendingId: number) =>
      apiClient<PartyBoard>(`/parties/pending/${pendingId}/accept`, { method: 'POST' }),
    onSuccess: (data) => setBoard(queryClient, data),
  })
}

export function useRejectPartyPending() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (pendingId: number) =>
      apiClient<PartyBoard>(`/parties/pending/${pendingId}/reject`, { method: 'POST' }),
    onSuccess: (data) => setBoard(queryClient, data),
  })
}

export function useCancelPartyPending() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (pendingId: number) =>
      apiClient<PartyBoard>(`/parties/pending/${pendingId}`, { method: 'DELETE' }),
    onSuccess: (data) => setBoard(queryClient, data),
  })
}

export function useUpsertPartyLfg() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { note?: string }) =>
      apiClient<PartyBoard>('/parties/lfg', { method: 'PUT', body }),
    onSuccess: (data) => setBoard(queryClient, data),
  })
}

export function useLeavePartyLfg() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient<PartyBoard>('/parties/lfg', { method: 'DELETE' }),
    onSuccess: (data) => setBoard(queryClient, data),
  })
}

/** Admin: takes another member off the waiting list. */
export function useRemoveFromPartyLfg() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (memberId: number) => apiClient<PartyBoard>(`/parties/lfg/${memberId}`, { method: 'DELETE' }),
    onSuccess: (data) => setBoard(queryClient, data),
  })
}

/** Admin: puts another member on the waiting list. */
export function useAddToPartyLfg() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (memberId: number) => apiClient<PartyBoard>(`/parties/lfg/${memberId}`, { method: 'POST' }),
    onSuccess: (data) => setBoard(queryClient, data),
  })
}

export function useCreatePartyForMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { map: PartyMap; leaderMemberId: number }) =>
      apiClient<PartyBoard>('/parties/for-member', { method: 'POST', body }),
    onSuccess: (data) => setBoard(queryClient, data),
  })
}

export function useAssembleParty() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { map: PartyMap; leaderMemberId: number; memberIds: number[] }) =>
      apiClient<PartyBoard>('/parties/assemble', { method: 'POST', body }),
    onSuccess: (data) => setBoard(queryClient, data),
  })
}

export function useCreateEmptyParty() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { map: PartyMap; spot?: string }) =>
      apiClient<PartyBoard>('/parties/empty', { method: 'POST', body }),
    onSuccess: (data) => setBoard(queryClient, data),
  })
}

export function useMovePartyMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      partyId,
      memberId,
      fromPartyId,
    }: {
      partyId: number
      memberId: number
      fromPartyId: number | null
    }) =>
      apiClient<PartyBoard>(`/parties/${partyId}/move`, {
        method: 'POST',
        body: { memberId, fromPartyId },
      }),
    onSuccess: (data) => setBoard(queryClient, data),
  })
}

export function useKickPartyMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ partyId, memberId }: { partyId: number; memberId: number }) =>
      apiClient<PartyBoard>(`/parties/${partyId}/kick`, {
        method: 'POST',
        body: { memberId },
      }),
    onSuccess: (data) => setBoard(queryClient, data),
  })
}

export function useTransferPartyLeader() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ partyId, memberId }: { partyId: number; memberId: number }) =>
      apiClient<PartyBoard>(`/parties/${partyId}/leader`, {
        method: 'POST',
        body: { memberId },
      }),
    onSuccess: (data) => setBoard(queryClient, data),
  })
}

export function useAddPartyMemberDirect() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ partyId, memberId }: { partyId: number; memberId: number }) =>
      apiClient<PartyBoard>(`/parties/${partyId}/members`, {
        method: 'POST',
        body: { memberId },
      }),
    onSuccess: (data) => setBoard(queryClient, data),
  })
}

function parsePartyMemberNotice(body: string): PartyMemberNotice | null {
  try {
    const parsed = JSON.parse(body) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const raw = parsed as PartyMemberNotice
    if (raw.type !== 'KICKED_FROM_PARTY' || typeof raw.message !== 'string') return null
    return raw
  } catch {
    return null
  }
}

export function usePartyMemberNotices(
  memberId: number | undefined,
  onNotice: (notice: PartyMemberNotice) => void,
) {
  useEffect(() => {
    if (!memberId) return
    return subscribeTopicEffect(`/topic/parties/member/${memberId}`, (message) => {
      const notice = parsePartyMemberNotice(message.body)
      if (notice) onNotice(notice)
    })
  }, [memberId, onNotice])
}

export function usePartyQueuePriority() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ memberId, delta }: { memberId: number; delta: 1 | -1 }) =>
      apiClient<PartyBoard>(`/parties/lfg/${memberId}/priority`, { method: 'POST', body: { delta } }),
    onSuccess: (data) => setBoard(queryClient, data),
  })
}

export function usePartyQueueUnanswered() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (memberId: number) => apiClient<PartyBoard>(`/parties/lfg/${memberId}/unanswered`, { method: 'POST' }),
    onSuccess: (data) => setBoard(queryClient, data),
  })
}

export function usePartyAfk() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ memberId, active }: { memberId: number; active: boolean }) =>
      apiClient<PartyBoard>(`/parties/members/${memberId}/afk`, { method: 'PUT', body: { active } }),
    onSuccess: (data) => setBoard(queryClient, data),
    onSettled: () => queryClient.invalidateQueries({ queryKey: partyKeys.board, exact: true }),
  })
}
