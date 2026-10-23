import { expect, it } from 'vitest'
import type { EquipmentAssignment } from '../types'
import { summarizeDeliveries } from './equipmentDeliveries'

it('counts receipts by category, required level and grade without double-counting corrections or cancellations', () => {
  const record = { origin: 'GUILD_DISTRIBUTION', status: 'ACTIVE', category: 'WEAPON', level: 45, grade: 1 } as EquipmentAssignment
  expect(summarizeDeliveries([
    record, { ...record, status: 'TRANSFERRED' }, { ...record, status: 'CORRECTED' }, { ...record, status: 'CANCELLED' },
    { ...record, origin: 'INITIAL' }, { ...record, level: 40 }, { ...record, grade: 3 }, { ...record, category: 'RING', level: 1, grade: 0 },
  ])).toEqual([
    { category: 'RING', level: 1, grade: 0, count: 1 },
    { category: 'WEAPON', level: 40, grade: 1, count: 1 },
    { category: 'WEAPON', level: 45, grade: 1, count: 2 },
    { category: 'WEAPON', level: 45, grade: 3, count: 1 },
  ])
  expect(summarizeDeliveries([])).toEqual([])
})
