import { useEffect } from 'react'
import { useAuthContext } from '@/Features/Auth/contexts/AuthContext'
import { subscribeTopicEffect } from '@/Shared/websocket/socketClient'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/Shared/api/client'
import type { CatalogFilters, CatalogPage, CurrentEquipment, EquipmentAssignment, EquipmentOperation, EquipmentSlotEdit, EquipmentSlotEditResult, ImportStatus, MemberEquipment } from '../types'

export function useEquipment() {
  const queries = useQueryClient()
  const { hasRole } = useAuthContext()
  const admin = hasRole('ADMINISTRADOR')
  useEffect(() => subscribeTopicEffect('/topic/equipment', () => {
    void queries.invalidateQueries({ queryKey: ['equipment', 'board'] })
    void queries.invalidateQueries({ queryKey: ['equipment', 'reviews'] })
    if (admin) void queries.invalidateQueries({ queryKey: ['equipment', 'history'] })
  }), [queries, admin])
  return useQuery({ queryKey: ['equipment', 'board', admin ? 'admin' : 'public'], queryFn: () => apiClient<MemberEquipment[]>('/equipment'), refetchInterval: 15000 })
}
export function useEquipmentHistory(memberId: number, enabled = true) {
  return useQuery({ queryKey: ['equipment', 'history', memberId], queryFn: () => apiClient<EquipmentAssignment[]>(`/equipment/members/${memberId}/history`), enabled: enabled && memberId > 0, refetchInterval: 15000 })
}
export function useEquipmentCatalog(category: string, search: string, page: number, enabled: boolean, filters: CatalogFilters = {}) {
  const params = new URLSearchParams({ category, search, page: String(page), size: '30' })
  params.set('race', filters.race ?? 'CORA')
  if (filters.equipmentClass) params.set('equipmentClass', filters.equipmentClass)
  if (filters.level !== undefined) params.set('level', String(filters.level))
  if (filters.grade !== undefined) params.set('grade', String(filters.grade))
  if (filters.ability) params.set('ability', filters.ability)
  return useQuery({ queryKey: ['equipment', 'catalog', category, search, page, filters], queryFn: () => apiClient<CatalogPage>(`/equipment/catalog?${params}`), enabled })
}
export function useEquipmentImportStatus() {
  return useQuery({ queryKey: ['equipment', 'import'], queryFn: () => apiClient<ImportStatus>('/equipment/catalog/status') })
}
export function useEquipmentOperation() {
  const queries = useQueryClient()
  return useMutation({
    mutationFn: (body: EquipmentOperation) => apiClient<CurrentEquipment>('/equipment/operations', { method: 'POST', body }),
    onSettled: () => Promise.all([
      queries.invalidateQueries({ queryKey: ['equipment', 'board'] }),
      queries.invalidateQueries({ queryKey: ['equipment', 'history'] }),
    ]),
    onSuccess: () => queries.invalidateQueries({ queryKey: ['logs'] }),
  })
}
export function useEquipmentSlotEdit() {
  const queries = useQueryClient()
  return useMutation({
    mutationFn: (body: EquipmentSlotEdit) => apiClient<EquipmentSlotEditResult>('/equipment/slots', { method: 'POST', body }),
    onSettled: () => Promise.all([
      queries.invalidateQueries({ queryKey: ['equipment', 'board'] }),
      queries.invalidateQueries({ queryKey: ['equipment', 'history'] }),
      queries.invalidateQueries({ queryKey: ['logs'] }),
    ]),
  })
}

export function useEquipmentReviews() {
  const { user } = useAuthContext()
  return useQuery({ queryKey: ['equipment', 'reviews', user?.memberId], queryFn: () => apiClient<import('../types').EquipmentReview[]>('/equipment/reviews'), enabled: !!user?.profileComplete && user.status === 'APROVADO', refetchInterval: 15000 })
}
export function useEquipmentReviewAction() {
  const queries = useQueryClient()
  return useMutation({
    mutationFn: (action: { memberId: number; operationId: string } | { confirmId: string }) => 'confirmId' in action
      ? apiClient('/equipment/reviews/' + action.confirmId + '/confirm', { method: 'POST' })
      : apiClient('/equipment/reviews', { method: 'POST', body: action }),
    onSettled: () => Promise.all([queries.invalidateQueries({ queryKey: ['equipment', 'reviews'] }), queries.invalidateQueries({ queryKey: ['logs'] })]),
  })
}
