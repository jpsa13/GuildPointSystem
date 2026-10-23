import { describe, expect, it } from 'vitest'
import { formatLogDetails } from './formatLogEntry'

describe('equipment removal audit labels', () => {
  it.each([
    ['REMOVE', 'Equipamento removido'],
    ['CLEAR', 'Equipamentos limpos'],
    ['UNDO_REDO', 'Remoção desfeita/refeita'],
  ])('formats %s without a missing assignment number', (action, label) => {
    expect(formatLogDetails({ id: 1, type: 'EQUIPMENT_CHANGED', actorId: 1, actorNickname: 'Admin',
      targetId: 2, targetNickname: 'Player', payload: { action, slot: 'Weapon, Helmet' }, createdAt: '2026-10-22T12:00:00Z' }))
      .toBe(`Weapon, Helmet · ${label}`)
  })
})

it('includes batch quantity in private delivery audit details', () => {
  expect(formatLogDetails({ id: 1, type: 'EQUIPMENT_CHANGED', actorId: 1, actorNickname: 'Admin',
    targetId: 2, targetNickname: 'Player', payload: { action: 'CREATE', slot: 'Weapon', quantity: 3, assignmentId: 10 }, createdAt: '2026-10-23T12:00:00Z' }))
    .toBe('Weapon · Entrega de 3 unidade(s) · Registro #10')
})
