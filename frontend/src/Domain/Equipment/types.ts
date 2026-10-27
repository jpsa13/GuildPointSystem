import type { EffectDisplayType } from '@/Domain/types/models'

export const EQUIPMENT_GROUPS = [
  { id: 'weapons', label: 'Armas', slots: ['Weapon', 'Weapon2'] },
  { id: 'armor', label: 'Armaduras', slots: ['Helmet', 'Upper', 'Lower', 'Gloves', 'Shoes', 'Cloak'] },
  { id: 'accessories', label: 'Acessórios', slots: ['Amulet1', 'Amulet2', 'Ring1', 'Ring2'] },
] as const
export type EquipmentSlot = typeof EQUIPMENT_GROUPS[number]['slots'][number]
export const SLOT_CATEGORY: Record<EquipmentSlot, string> = {
  Weapon: 'WEAPON', Weapon2: 'WEAPON', Helmet: 'HELMET', Upper: 'UPPER', Lower: 'LOWER',
  Gloves: 'GLOVES', Shoes: 'SHOES', Amulet1: 'AMULET', Amulet2: 'AMULET', Ring1: 'RING', Ring2: 'RING', Cloak: 'CLOAK',
}
export interface EquipmentEffect { key: string; code: number | null; name: string; displayType: EffectDisplayType; value: number; description?: string | null; unitHint?: string | null }
export interface EquipmentItem { id: number; category: string; gameCode: string; name: string; level: number; grade: number; effects: EquipmentEffect[]; iconId?: number | null; sourceHash?: string; effectsNote?: string | null }
export interface EquipmentAssignment extends Omit<EquipmentItem, 'id' | 'effects'> {
  gearScore?: { points: number | null; originalLevel: number | null; included: boolean }
  id: number; memberId: number; slot: EquipmentSlot; catalogId: number; effect: EquipmentEffect
  origin: 'INITIAL' | 'GUILD_DISTRIBUTION' | 'GAME_CLIENT'; occurredOn: string; actorId: number; actorName: string
  createdAt: string; status: 'ACTIVE' | 'CANCELLED' | 'CORRECTED' | 'TRANSFERRED'; correctsId: number | null; reason: string | null
  statusReason?: string | null; statusActorName?: string | null; statusChangedAt?: string | null
}
export type CurrentEquipment = Pick<EquipmentAssignment, 'id' | 'memberId' | 'slot' | 'catalogId' | 'gameCode' | 'name' | 'level' | 'grade' | 'category' | 'effect' | 'iconId' | 'sourceHash'> & Partial<EquipmentAssignment>
export interface CurrentSlot { slot: EquipmentSlot; version: number; assignment: CurrentEquipment | null }
export interface MemberEquipment { memberId: number; nickname: string; level: number; expPercent?: number | null; classId?: number | null; className?: string | null; classImageUrl?: string | null; slots: CurrentSlot[]; gearScore?: { total: number; weapon: number; armor: number; accessories: number; unscored: number } }
export interface EquipmentSlotEdit { operationId: string; memberId: number; slots: { slot: EquipmentSlot; expectedVersion: number }[]; reversesOperationId?: string }
export interface EquipmentSlotEditResult { operationId: string; memberId: number; slots: CurrentSlot[] }
export interface EquipmentOperation {
  operationId: string; action: 'CREATE' | 'EQUIP' | 'CORRECT' | 'CANCEL' | 'TRANSFER'; memberId: number; slot: EquipmentSlot
  expectedVersion: number; assignmentId?: number; catalogId?: number; effectKey?: string; quantity?: number
  origin?: EquipmentAssignment['origin']; occurredOn?: string; useAsCurrent: boolean; replacementId?: number; restoration?: 'EMPTY' | 'PREVIOUS'; reason?: string
  transfer?: { memberId: number; slot?: EquipmentSlot; expectedVersion: number; replaceCurrent: boolean }
}
export interface CatalogFilters { race?: 'CORA' | 'BELLATO' | 'ACCRETIA' | 'ALL'; equipmentClass?: 'MELEE' | 'RANGER' | 'FORCE' | 'LAUNCHER'; level?: number; grade?: number; ability?: string; accessoryEffect?: 'ATTACK' | 'DODGE' | 'DEFENSE'; weaponType?: number }
export interface CatalogPage { abilities?: string[]; weaponTypes?: number[]; items: EquipmentItem[]; total: number; page: number; size: number }
export interface ImportStatus { imported_count?: number; excluded?: string }

export interface EquipmentReview { id: string; memberId: number; requestedAt: string; dueAt: string; confirmedAt: string | null; status: 'PENDING' | 'OVERDUE' | 'CONFIRMED'; overdue: boolean }
