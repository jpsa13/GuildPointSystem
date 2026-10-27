import { useEffect, useMemo, useState } from 'react'
import { useAuthContext } from '@/Features/Auth/contexts/AuthContext'
import { onSocketConnect, subscribeTopicEffect } from '@/Shared/websocket/socketClient'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/Shared/api/client'
import type { CatalogFilters, CatalogPage, CurrentEquipment, EquipmentAssignment, EquipmentOperation, EquipmentSlotEdit, EquipmentSlotEditResult, ImportStatus, MemberEquipment } from '../types'

export function useEquipmentSubscription() {
  const queries = useQueryClient()
  const { hasRole, user } = useAuthContext()
  const admin = hasRole('ADMINISTRADOR')
  const memberId = user?.memberId
  const enabled = !!memberId && !!user?.profileComplete && user.status === 'APROVADO'
  useEffect(() => {
    if (!enabled) return
    const refresh = (catalogChanged = false) => {
      void queries.invalidateQueries({ queryKey: ['equipment', 'board'] })
      void queries.invalidateQueries({ queryKey: ['equipment', 'reviews'] })
      void queries.invalidateQueries({ queryKey: ['equipment', 'relics'] })
      if (admin) {
        void queries.invalidateQueries({ queryKey: ['equipment', 'history'] })
        void queries.invalidateQueries({ queryKey: ['logs'] })
      }
      if (catalogChanged) {
        void queries.invalidateQueries({ queryKey: ['equipment', 'catalog'] })
        void queries.invalidateQueries({ queryKey: ['equipment', 'import'] })
      }
    }
    const unsubscribe = subscribeTopicEffect('/topic/equipment', message => {
      try { refresh(JSON.parse(message.body)?.catalogChanged === true) }
      catch { refresh(true) }
    })
    const unsubscribeStatus = subscribeTopicEffect('/topic/character-status', () => {
      void queries.invalidateQueries({ queryKey: ['equipment', 'board'] })
    })
    // A primeira conexão também recupera mudanças entre a carga HTTP e a assinatura.
    const disconnect = onSocketConnect(() => refresh(true))
    return () => { unsubscribe(); unsubscribeStatus(); disconnect() }
  }, [queries, admin, memberId, enabled])
}
export function useEquipment() {
  const { hasRole } = useAuthContext()
  const admin = hasRole('ADMINISTRADOR')
  return useQuery({ queryKey: ['equipment', 'board', admin ? 'admin' : 'public'], queryFn: () => apiClient<MemberEquipment[]>('/equipment'), staleTime: Infinity })
}
export function useEquipmentHistory(memberId: number, enabled = true) {
  return useQuery({ queryKey: ['equipment', 'history', memberId], queryFn: () => apiClient<EquipmentAssignment[]>(`/equipment/members/${memberId}/history`), enabled: enabled && memberId > 0, staleTime: Infinity })
}
export function useEquipmentRelics(memberId: number) {
  return useQuery({ queryKey: ['equipment', 'relics', memberId], queryFn: () => apiClient<number[]>(`/equipment/members/${memberId}/relics`), enabled: memberId > 0, staleTime: Infinity })
}
export function useEquipmentRelicChange(memberId: number) {
  const queries = useQueryClient()
  const key = ['equipment', 'relics', memberId]
  return useMutation({
    mutationFn: ({ relicId, active }: { relicId: number; active: boolean }) => apiClient<number[]>(`/equipment/members/${memberId}/relics/${relicId}`, { method: 'PUT', body: { active } }),
    onSuccess: data => { queries.setQueryData(key, data); void queries.invalidateQueries({ queryKey: ['logs'] }) },
    onSettled: () => queries.invalidateQueries({ queryKey: key }),
  })
}
export function useEquipmentCatalog(category: string, search: string, page: number, enabled: boolean, filters: CatalogFilters = {}) {
  const params = new URLSearchParams({ category, search, page: String(page), size: '30' })
  params.set('race', filters.race ?? 'CORA')
  if (filters.equipmentClass) params.set('equipmentClass', filters.equipmentClass)
  if (filters.level !== undefined) params.set('level', String(filters.level))
  if (filters.grade !== undefined) params.set('grade', String(filters.grade))
  if (filters.ability) params.set('ability', filters.ability)
  if (filters.accessoryEffect) params.set('accessoryEffect', filters.accessoryEffect)
  if (filters.weaponType !== undefined) params.set('weaponType', String(filters.weaponType))
  return useQuery({ queryKey: ['equipment', 'catalog', category, search, page, filters], queryFn: () => apiClient<CatalogPage>(`/equipment/catalog?${params}`), enabled, staleTime: Infinity })
}
export function useEquipmentImportStatus() {
  return useQuery({ queryKey: ['equipment', 'import'], queryFn: () => apiClient<ImportStatus>('/equipment/catalog/status'), staleTime: Infinity })
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
  const enabled = !!user?.profileComplete && user.status === 'APROVADO'
  const query = useQuery({ queryKey: ['equipment', 'reviews', user?.memberId], queryFn: () => apiClient<import('../types').EquipmentReview[]>('/equipment/reviews'), enabled, staleTime: Infinity })
  const [clock, setClock] = useState(Date.now)
  const now = Math.max(clock, query.dataUpdatedAt)
  useEffect(() => {
    if (!enabled) return
    const next = Math.min(...(query.data ?? []).filter(r => !r.confirmedAt && r.status !== 'CONFIRMED' && !r.overdue)
      .map(r => Date.parse(r.dueAt)).filter(due => due > now))
    if (!Number.isFinite(next)) return
    const timer = setTimeout(() => setClock(Date.now()), Math.min(Math.max(0, next - Date.now()), 2_147_483_647))
    return () => clearTimeout(timer)
  }, [query.data, enabled, now])
  const data = useMemo(() => query.data?.map(r => !r.confirmedAt && r.status !== 'CONFIRMED' && (r.overdue || Date.parse(r.dueAt) <= now)
    ? { ...r, overdue: true, status: 'OVERDUE' as const } : r), [query.data, now])
  return { ...query, data }
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
