import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/Shared/api/client'

export interface PartyDiscordCall {
  partyId: number
  runId: string
  state: 'WAITING' | 'SENDING' | 'COMPLETE' | 'FAILED' | 'CANCELLED'
  sent: number
  confirmed: string[]
  pending: string[]
  skipped: string[]
  nextAt: string | null
  endsAt: string
  messageUrl: string | null
  error: string | null
}

export interface PartyDiscordBoard {
  available: boolean
  reason: string | null
  calls: PartyDiscordCall[]
}

const key = ['party', 'discord-calls'] as const

export function usePartyDiscordCalls() {
  return useQuery({
    queryKey: key,
    queryFn: () => apiClient<PartyDiscordBoard>('/parties/discord-calls'),
    refetchInterval: 5000,
  })
}

export function useCallPartyDiscord() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (partyId: number) => apiClient<PartyDiscordCall>(`/parties/${partyId}/discord-call`, { method: 'POST' }),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  })
}
