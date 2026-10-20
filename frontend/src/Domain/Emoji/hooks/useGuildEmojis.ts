import { useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, API_BASE, apiClient, getToken } from '@/Shared/api/client'
import { formatApiError } from '@/Shared/utils/formatApiError'
import { onSocketReconnect, subscribeTopicEffect } from '@/Shared/websocket/socketClient'

export interface GuildEmoji {
  id: number
  name: string
  imageUrl: string
  animated: boolean
}

export const guildEmojiKeys = {
  all: ['guild-emojis'] as const,
}

/** All guild emojis, A→Z. Kept fresh by {@link useGuildEmojisSubscription} (mounted once in the layout). */
export function useGuildEmojis() {
  return useQuery({
    queryKey: guildEmojiKeys.all,
    queryFn: () => apiClient<GuildEmoji[]>('/emojis'),
    staleTime: Infinity,
  })
}

/** Guild emojis keyed by name, for `:name:` lookups. */
export function useGuildEmojiMap() {
  const { data } = useGuildEmojis()
  return useMemo(() => new Map((data ?? []).map((e) => [e.name, e])), [data])
}

export function useGuildEmojisSubscription() {
  const queryClient = useQueryClient()
  useEffect(
    () =>
      subscribeTopicEffect('/topic/emojis', () =>
        queryClient.invalidateQueries({ queryKey: guildEmojiKeys.all }),
      ),
    [queryClient],
  )
  useEffect(
    () => onSocketReconnect(() => queryClient.invalidateQueries({ queryKey: guildEmojiKeys.all })),
    [queryClient],
  )
}

/** Líder/Administrador. Multipart upload (the shared apiClient only sends JSON). */
export function useCreateGuildEmoji() {
  const queryClient = useQueryClient()
  return useMutation({
    /** `crop`: square of a GIF in source pixels (static images are sent already cropped). */
    mutationFn: async ({
      name,
      file,
      crop,
    }: {
      name: string
      file: Blob
      crop?: { x: number; y: number; size: number }
    }) => {
      const formData = new FormData()
      formData.append('name', name)
      formData.append('file', file)
      if (crop) {
        formData.append('cropX', String(crop.x))
        formData.append('cropY', String(crop.y))
        formData.append('cropSize', String(crop.size))
      }
      const token = getToken()
      const response = await fetch(`${API_BASE}/emojis`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      })
      if (!response.ok) {
        let message = response.statusText
        try {
          const err = (await response.json()) as { message?: string }
          if (err.message) message = err.message
        } catch {
          /* ignore */
        }
        throw new ApiError(formatApiError(message), response.status)
      }
      return (await response.json()) as GuildEmoji
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: guildEmojiKeys.all }),
  })
}

/** Líder/Administrador. Reactions with the emoji are removed with it. */
export function useDeleteGuildEmoji() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiClient<void>(`/emojis/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: guildEmojiKeys.all }),
  })
}
