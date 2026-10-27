import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/Shared/api/client'

/** Convite pelo jogo: a DLL do cliente do líder digita "@party Nick" para cada integrante. */
export interface PartyGameInvite {
  partyId: number
  id: string
  leader: string
  state: 'WAITING' | 'DELIVERED' | 'COMPLETE' | 'EXPIRED'
  nicks: string[]
  skipped: string[]
  createdAt: string
  expiresAt: string
}

const key = (partyId: number) => ['party', 'game-invite', partyId] as const

export function usePartyGameInvite(partyId: number, enabled: boolean) {
  return useQuery({
    queryKey: key(partyId),
    queryFn: async () => (await apiClient<PartyGameInvite | undefined>(`/parties/${partyId}/game-invite`)) ?? null,
    enabled,
    refetchInterval: (query) => (query.state.data?.state === 'WAITING' || query.state.data?.state === 'DELIVERED' ? 3000 : 15000),
  })
}

export function useCallPartyInGame(partyId: number) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient<PartyGameInvite>(`/parties/${partyId}/game-invite`, { method: 'POST' }),
    onSuccess: (data) => client.setQueryData(key(partyId), data),
  })
}
