import { expect, it } from 'vitest'
import type { EquipmentAssignment } from '../types'
import { summarizeDeliveries } from './equipmentDeliveries'

it('counts guild deliveries (standalone or equipped) by category, level and grade without double-counting corrections or cancellations', () => {
  const record = { origin: 'GUILD_DISTRIBUTION', deliveryOnly: true, status: 'ACTIVE', category: 'WEAPON', level: 45, grade: 1 } as EquipmentAssignment
  expect(summarizeDeliveries([
    record, { ...record, status: 'TRANSFERRED' }, { ...record, status: 'CORRECTED' }, { ...record, status: 'CANCELLED' },
    // Equipado no slot como "Entrega da guild" também conta; inicial e enviado pelo jogo não.
    { ...record, deliveryOnly: false }, { ...record, deliveryOnly: undefined },
    { ...record, deliveryOnly: false, origin: 'INITIAL' }, { ...record, deliveryOnly: false, origin: 'GAME_CLIENT' },
    { ...record, level: 40 }, { ...record, grade: 3 }, { ...record, category: 'RING', level: 1, grade: 0 },
  ])).toEqual([
    { category: 'RING', level: 1, grade: 0, count: 1 },
    { category: 'WEAPON', level: 40, grade: 1, count: 1 },
    { category: 'WEAPON', level: 45, grade: 1, count: 4 },
    { category: 'WEAPON', level: 45, grade: 3, count: 1 },
  ])
  expect(summarizeDeliveries([])).toEqual([])
})
