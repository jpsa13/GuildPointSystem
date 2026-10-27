import type { EquipmentAssignment } from '../types'

export function summarizeDeliveries(history: EquipmentAssignment[]) {
  const totals = new Map<string, { category: string; level: number; grade: number; count: number }>()
  for (const record of history) {
    if (!record.deliveryOnly || !['ACTIVE', 'TRANSFERRED'].includes(record.status)) continue
    const key = `${record.category}:${record.level}:${record.grade}`
    const total = totals.get(key) ?? { category: record.category, level: record.level, grade: record.grade, count: 0 }
    total.count++
    totals.set(key, total)
  }
  return [...totals.values()].sort((a, b) => a.category.localeCompare(b.category) || a.level - b.level || a.grade - b.grade)
}
