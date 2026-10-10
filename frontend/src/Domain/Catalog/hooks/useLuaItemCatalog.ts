import { useQuery } from '@tanstack/react-query'

import type { GameLuaItem, LuaItemCategory, Page } from '@/Domain/types/models'
import { apiClient } from '@/Shared/api/client'

export const LUA_ITEM_PAGE_SIZE = 24

export interface LuaItemCatalogFilters {
  search?: string
  page?: number
  size?: number
}

export const luaItemCatalogKeys = {
  list: (category: LuaItemCategory, filters: LuaItemCatalogFilters) =>
    ['catalog', 'lua-items', category, filters] as const,
}

export function useLuaItemCatalog(
  category: LuaItemCategory,
  filters: LuaItemCatalogFilters,
  enabled: boolean,
) {
  const params = new URLSearchParams()
  params.set('category', category)
  if (filters.search) params.set('search', filters.search)
  params.set('page', String(filters.page ?? 0))
  params.set('size', String(filters.size ?? LUA_ITEM_PAGE_SIZE))

  const query = params.toString()

  return useQuery({
    queryKey: luaItemCatalogKeys.list(category, filters),
    queryFn: () => apiClient<Page<GameLuaItem>>(`/catalog/lua-items?${query}`),
    enabled,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    placeholderData: (prev) => prev,
  })
}
