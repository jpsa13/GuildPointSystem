import { useQuery } from '@tanstack/react-query'

import { apiClient } from '@/Shared/api/client'

import type {
  CatalogIconRef,
  EffectDefinition,
  GameAccessory,
  GameArmor,
  GameWeapon,
  ItemSet,
  Page,
} from '@/Domain/types/models'

export const CATALOG_PAGE_SIZE = 12

export interface CatalogAccessoryFilters {
  subtype?: 'RING' | 'AMULET'
  grade?: number
  civilMask?: string
  search?: string
  page?: number
  size?: number
}

export interface CatalogArmorFilters {
  slot?: GameArmor['slot']
  grade?: number
  civilMask?: string
  minLevel?: number
  search?: string
  page?: number
  size?: number
}

export interface CatalogWeaponFilters {
  weaponType?: GameWeapon['weaponType']
  grade?: number
  civilMask?: string
  minLevel?: number
  search?: string
  page?: number
  size?: number
}

export const catalogKeys = {
  accessories: (filters: CatalogAccessoryFilters) =>
    ['catalog', 'accessories', filters] as const,
  accessory: (gameCode: string) => ['catalog', 'accessories', gameCode] as const,
  accessoryIconIndex: ['catalog', 'accessories', 'icon-index'] as const,
  armor: (filters: CatalogArmorFilters) => ['catalog', 'armor', filters] as const,
  armorItem: (gameCode: string) => ['catalog', 'armor', gameCode] as const,
  armorIconIndex: ['catalog', 'armor', 'icon-index'] as const,
  weapons: (filters: CatalogWeaponFilters) => ['catalog', 'weapons', filters] as const,
  weapon: (gameCode: string) => ['catalog', 'weapons', gameCode] as const,
  weaponIconIndex: ['catalog', 'weapons', 'icon-index'] as const,
  effects: ['catalog', 'effects'] as const,
  sets: (gameCode: string) => ['catalog', 'sets', gameCode] as const,
  allSets: ['catalog', 'sets', 'all'] as const,
}

export function useCatalogAccessories(filters: CatalogAccessoryFilters, enabled = true) {
  const params = new URLSearchParams()
  if (filters.subtype) params.set('subtype', filters.subtype)
  if (filters.grade != null) params.set('grade', String(filters.grade))
  if (filters.civilMask) params.set('civilMask', filters.civilMask)
  if (filters.search) params.set('search', filters.search)
  params.set('page', String(filters.page ?? 0))
  params.set('size', String(filters.size ?? CATALOG_PAGE_SIZE))

  const query = params.toString()

  return useQuery({
    queryKey: catalogKeys.accessories(filters),
    queryFn: async () => {
      const path = `/catalog/accessories?${query}`
      return apiClient<Page<GameAccessory>>(path)
    },
    enabled,
    placeholderData: (prev) => prev,
  })
}

export function useCatalogAccessory(gameCode: string | null) {
  return useQuery({
    queryKey: catalogKeys.accessory(gameCode ?? ''),
    queryFn: () => apiClient<GameAccessory>(`/catalog/accessories/${gameCode}`),
    enabled: Boolean(gameCode),
  })
}

export function useCatalogAccessoryIconIndex(enabled = true) {
  return useQuery({
    queryKey: catalogKeys.accessoryIconIndex,
    queryFn: () => apiClient<CatalogIconRef[]>('/catalog/accessories/icon-index'),
    staleTime: 5 * 60 * 1000,
    enabled,
  })
}

export function useCatalogEffects() {
  return useQuery({
    queryKey: catalogKeys.effects,
    queryFn: () => apiClient<EffectDefinition[]>('/catalog/effects'),
  })
}

export function useCatalogSets(gameCode: string | null) {
  return useQuery({
    queryKey: catalogKeys.sets(gameCode ?? ''),
    queryFn: () => apiClient<ItemSet[]>(`/catalog/sets?gameCode=${encodeURIComponent(gameCode!)}`),
    enabled: Boolean(gameCode),
  })
}

export function useAllCatalogSets(enabled = true) {
  return useQuery({
    queryKey: catalogKeys.allSets,
    queryFn: () => apiClient<ItemSet[]>('/catalog/sets'),
    staleTime: 5 * 60 * 1000,
    enabled,
  })
}

export function useCatalogArmor(filters: CatalogArmorFilters, enabled = true) {
  const params = new URLSearchParams()
  if (filters.slot) params.set('slot', filters.slot)
  if (filters.grade != null) params.set('grade', String(filters.grade))
  if (filters.civilMask) params.set('civilMask', filters.civilMask)
  if (filters.minLevel != null) params.set('minLevel', String(filters.minLevel))
  if (filters.search) params.set('search', filters.search)
  params.set('page', String(filters.page ?? 0))
  params.set('size', String(filters.size ?? CATALOG_PAGE_SIZE))

  const query = params.toString()

  return useQuery({
    queryKey: catalogKeys.armor(filters),
    queryFn: async () => {
      const path = `/catalog/armor?${query}`
      return apiClient<Page<GameArmor>>(path)
    },
    enabled,
    placeholderData: (prev) => prev,
  })
}

export function useCatalogArmorIconIndex(enabled = true) {
  return useQuery({
    queryKey: catalogKeys.armorIconIndex,
    queryFn: () => apiClient<CatalogIconRef[]>('/catalog/armor/icon-index'),
    staleTime: 5 * 60 * 1000,
    enabled,
  })
}

export function useCatalogWeapons(filters: CatalogWeaponFilters, enabled = true) {
  const params = new URLSearchParams()
  if (filters.weaponType) params.set('weaponType', filters.weaponType)
  if (filters.grade != null) params.set('grade', String(filters.grade))
  if (filters.civilMask) params.set('civilMask', filters.civilMask)
  if (filters.minLevel != null) params.set('minLevel', String(filters.minLevel))
  if (filters.search) params.set('search', filters.search)
  params.set('page', String(filters.page ?? 0))
  params.set('size', String(filters.size ?? CATALOG_PAGE_SIZE))

  const query = params.toString()

  return useQuery({
    queryKey: catalogKeys.weapons(filters),
    queryFn: async () => {
      const path = `/catalog/weapons?${query}`
      return apiClient<Page<GameWeapon>>(path)
    },
    enabled,
    placeholderData: (prev) => prev,
  })
}

export function useCatalogWeaponIconIndex(enabled = true) {
  return useQuery({
    queryKey: catalogKeys.weaponIconIndex,
    queryFn: () => apiClient<CatalogIconRef[]>('/catalog/weapons/icon-index'),
    staleTime: 5 * 60 * 1000,
    enabled,
  })
}
