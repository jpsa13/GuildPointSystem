import { useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
  hidden: ['discord', 'hidden'] as const,
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

/** Discord member (name, role color, avatar) of each linked site account, keyed by site member id. */
export function useDiscordBySiteMember() {
  const { data } = useDiscordMembers()
  return useMemo(() => {
    const bySite = new Map<number, DiscordMember>()
    data?.groups.forEach((g) =>
      g.members.forEach((m) => m.siteMemberId != null && bySite.set(m.siteMemberId, m)),
    )
    return bySite
  }, [data])
}

/** Líder/Administrador: members hidden from the list (refetched whenever the list changes). */
export function useHiddenDiscordMembers(enabled: boolean) {
  const { dataUpdatedAt } = useDiscordMembers()
  return useQuery({
    queryKey: [...discordKeys.hidden, dataUpdatedAt],
    queryFn: () => apiClient<DiscordMember[]>('/discord/hidden'),
    enabled,
    placeholderData: (previous) => previous,
  })
}

/** Líder/Administrador: hides or shows a member; the backend pushes the refreshed list. */
export function useSetDiscordMemberHidden() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, hidden }: { id: string; hidden: boolean }) =>
      apiClient<void>(`/discord/hidden/${id}`, { method: hidden ? 'PUT' : 'DELETE' }),
    onSuccess: () => {
      // Covers a dropped socket, like useLinkDiscord.
      window.setTimeout(() => queryClient.invalidateQueries({ queryKey: discordKeys.members }), 2500)
    },
  })
}
