import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/Shared/api/client'
import { onSocketReconnect, subscribeTopicEffect } from '@/Shared/websocket/socketClient'

export type DiscordStatus = 'online' | 'idle' | 'dnd' | 'offline'

export interface DiscordMember {
  id: string
  name: string
  avatarUrl: string
  color: string | null
  status: DiscordStatus
  customStatus: string | null
  activity: string | null
  inVoice: boolean
  siteMemberId: number | null
}

export interface DiscordRoleGroup {
  id: string
  name: string
  color: string | null
  onlineCount: number
  members: DiscordMember[]
}

export interface DiscordMembers {
  available: boolean
  guildName: string | null
  groups: DiscordRoleGroup[]
}

export const discordKeys = {
  members: ['discord', 'members'] as const,
}

/** Discord server sidebar (configured roles only); the backend pushes the full list on change. */
export function useDiscordMembers() {
  const queryClient = useQueryClient()

  useEffect(
    () =>
      subscribeTopicEffect('/topic/discord/members', (message) => {
        queryClient.setQueryData(discordKeys.members, JSON.parse(message.body) as DiscordMembers)
      }),
    [queryClient],
  )
  useEffect(
    () => onSocketReconnect(() => queryClient.invalidateQueries({ queryKey: discordKeys.members })),
    [queryClient],
  )

  return useQuery({
    queryKey: discordKeys.members,
    queryFn: () => apiClient<DiscordMembers>('/discord/members'),
    staleTime: Infinity,
  })
}
