import { useQuery } from '@tanstack/react-query'

import type { Item, LuaItemCategory, Page } from '@/Domain/types/models'
import { apiClient } from '@/Shared/api/client'

export const GUILD_INVENTORY_PAGE_SIZE = 24

export interface GuildInventoryFilters {
  category?: LuaItemCategory
  search?: string
  page?: number
  size?: number
}

export const guildInventoryKeys = {
  list: (filters: GuildInventoryFilters) => ['items', 'guild-inventory', filters] as const,
}

export function useGuildInventory(filters: GuildInventoryFilters, enabled = true) {
  const params = new URLSearchParams()
  if (filters.category) params.set('category', filters.category)
  if (filters.search) params.set('search', filters.search)
  params.set('page', String(filters.page ?? 0))
  params.set('size', String(filters.size ?? GUILD_INVENTORY_PAGE_SIZE))

  const query = params.toString()

  return useQuery({
    queryKey: guildInventoryKeys.list(filters),
    queryFn: () => apiClient<Page<Item>>(`/items?${query}`),
    enabled,
    placeholderData: (prev) => prev,
  })
}
