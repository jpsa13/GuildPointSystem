import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/Shared/api/client'
import type { EventClaim, Member, PointsModality } from '@/Domain/types/models'
import { authKeys } from '@/Domain/Auth/hooks/useAuth'

export const memberKeys = {
  all: ['members'] as const,
  ranking: ['members', 'ranking'] as const,
  pending: ['members', 'pending'] as const,
  detail: (id: number) => ['members', id] as const,
  claims: (id: number) => ['members', id, 'claims'] as const,
  me: ['members', 'me'] as const,
}

export function useMemberRanking() {
  return useQuery({
    queryKey: memberKeys.ranking,
    queryFn: () => apiClient<Member[]>('/members/ranking'),
  })
}

export function usePendingMembers() {
  return useQuery({
    queryKey: memberKeys.pending,
    queryFn: () => apiClient<Member[]>('/members/pending'),
  })
}

export function useMember(id: number) {
  return useQuery({
    queryKey: memberKeys.detail(id),
    queryFn: () => apiClient<Member>(`/members/${id}`),
    enabled: id > 0,
  })
}

export function useCurrentMember() {
  return useQuery({
    queryKey: memberKeys.me,
    queryFn: () => apiClient<Member>('/members/me'),
  })
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: number
      nickname: string
      raceId: number
      classId: number
      level: number
      avatarUrl?: string
    }) => apiClient<Member>(`/members/${id}/profile`, { method: 'PUT', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: memberKeys.all })
      queryClient.invalidateQueries({ queryKey: authKeys.me })
    },
  })
}

export function useApproveMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'APROVADO' | 'REJEITADO' }) =>
      apiClient<Member>(`/members/${id}/approval`, { method: 'PATCH', body: { status } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: memberKeys.all })
    },
  })
}

export function useMemberClaims(id: number) {
  return useQuery({
    queryKey: memberKeys.claims(id),
    queryFn: () => apiClient<EventClaim[]>(`/members/${id}/claims`),
    enabled: id > 0,
  })
}

export function useGrantManualEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ memberId, objectiveId }: { memberId: number; objectiveId: number }) =>
      apiClient<EventClaim>(`/members/${memberId}/manual-event`, {
        method: 'POST',
        body: { objectiveId },
      }),
    onSuccess: (_, { memberId }) => {
      queryClient.invalidateQueries({ queryKey: memberKeys.detail(memberId) })
      queryClient.invalidateQueries({ queryKey: memberKeys.claims(memberId) })
      queryClient.invalidateQueries({ queryKey: memberKeys.all })
      queryClient.invalidateQueries({ queryKey: ['logs'] })
    },
  })
}

export function useAdjustPoints() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      amount,
      modality,
      reason,
    }: {
      id: number
      amount: number
      modality: PointsModality
      reason: string
    }) =>
      apiClient<Member>(`/members/${id}/points`, {
        method: 'POST',
        body: { amount, modality, reason },
      }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: memberKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: memberKeys.all })
      queryClient.invalidateQueries({ queryKey: ['logs'] })
    },
  })
}

/** Líder/Administrador: delete a member's account (history kept, login and personal data wiped). */
export function useDeleteMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiClient<void>(`/members/${id}`, { method: 'DELETE' }),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: memberKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: memberKeys.all })
      queryClient.invalidateQueries({ queryKey: ['parties'] })
      queryClient.invalidateQueries({ queryKey: ['logs'] })
    },
  })
}

export function useUpdateMemberRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, role }: { id: number; role: Member['role'] }) =>
      apiClient<Member>(`/members/${id}/role`, { method: 'PATCH', body: { role } }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: memberKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: memberKeys.all })
      queryClient.invalidateQueries({ queryKey: authKeys.me })
      queryClient.invalidateQueries({ queryKey: ['logs'] })
    },
  })
}

/** Líder/Administrador: link a member to a Discord account, or unlink with `discordId: null`. */
export function useLinkDiscord() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, discordId }: { id: number; discordId: string | null }) =>
      apiClient<Member>(`/members/${id}/discord`, { method: 'PUT', body: { discordId } }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: memberKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: ['logs'] })
      // The backend pushes the refreshed Discord list over the socket; this covers a dropped socket.
      window.setTimeout(() => queryClient.invalidateQueries({ queryKey: ['discord', 'members'] }), 2500)
    },
  })
}
