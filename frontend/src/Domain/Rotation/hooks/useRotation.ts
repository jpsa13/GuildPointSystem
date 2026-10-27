import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/Shared/api/client'
import { onSocketConnect, subscribeTopicEffect } from '@/Shared/websocket/socketClient'

export const guilds = ['Energy', 'Espada', 'Quit', 'Devotion', 'Yonkou', 'Blacklist'] as const
export type Guild = typeof guilds[number]
export interface Assignment { guild: Guild; bosses: string[] }
export interface RotationSlot { time: string; qg: Assignment[]; outpost: Assignment[] }
export interface Rotation { version: number; updatedAt: string; slots: RotationSlot[] }

export function useRotation() {
  const queries = useQueryClient()
  useEffect(() => {
    const refresh = () => { void queries.invalidateQueries({ queryKey: ['rotation'] }) }
    const unsubscribe = subscribeTopicEffect('/topic/rotation', refresh)
    const disconnect = onSocketConnect(refresh)
    return () => { unsubscribe(); disconnect() }
  }, [queries])
  return useQuery({ queryKey: ['rotation'], queryFn: () => apiClient<Rotation>('/rotation/bosses'), staleTime: Infinity })
}
export function useSaveRotation() {
  const queries = useQueryClient()
  return useMutation({ mutationFn: (rotation: Rotation) => apiClient<Rotation>('/rotation/bosses', {
    method: 'PUT', body: { version: rotation.version, slots: rotation.slots },
  }), onSuccess: result => queries.setQueryData(['rotation'], result) })
}
