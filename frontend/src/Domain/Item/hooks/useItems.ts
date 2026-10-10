import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/Shared/api/client'
import type { Item, ItemType } from '@/Domain/types/models'
export const itemKeys = {
  all: ['items'] as const,
  detail: (id: number) => ['items', id] as const,
}

/** @deprecated Prefer useGuildInventory for listagem (paginated). */
export function useItems() {
  return useQuery({
    queryKey: [...itemKeys.all, 'legacy-page'],
    queryFn: () => apiClient<{ content: Item[] }>('/items?page=0&size=500'),
    select: (page) => page.content ?? [],
  })
}

export function useItem(id: number) {
  return useQuery({
    queryKey: itemKeys.detail(id),
    queryFn: () => apiClient<Item>(`/items/${id}`),
    enabled: id > 0,
  })
}

export function useCreateItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiClient<Item>('/items', { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: itemKeys.all })
      queryClient.invalidateQueries({ queryKey: ['items', 'guild-inventory'] })
    },
  })
}

export function useDeleteItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiClient<void>(`/items/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: itemKeys.all })
      queryClient.invalidateQueries({ queryKey: ['items', 'guild-inventory'] })
    },
  })
}

export function useUpdateItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      apiClient<Item>(`/items/${id}`, { method: 'PUT', body }),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: itemKeys.all })
      queryClient.invalidateQueries({ queryKey: ['items', 'guild-inventory'] })
      queryClient.invalidateQueries({ queryKey: itemKeys.detail(id) })
    },
  })
}

export type CreateItemPayload = {
  type: ItemType
  name?: string
  rarity?: string
  imageUrl?: string
  gameCode?: string
  description?: string
  weapon?: Record<string, unknown>
  armor?: Record<string, unknown>
  accessory?: Record<string, unknown>
  talics?: { talicType: string; level: number; slot: number }[]
}
