import { describe, expect, it } from 'vitest'
import { formatLogDetails } from './formatLogEntry'

it.each([true, false])('formats relic activation status (active=%s)', active => {
  expect(formatLogDetails({ id: 1, type: 'EQUIPMENT_CHANGED', actorId: 1, actorNickname: 'Admin',
    targetId: 2, targetNickname: 'Player', payload: { action: 'RELIC', relicId: 0, active }, createdAt: '2026-10-27T12:00:00Z' }))
    .toBe(`Relic #0 · ${active ? 'Ativada' : 'Desativada'}`)
})

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

describe('client equipment sync audit details', () => {
  const sync = (payload: Record<string, unknown>) => formatLogDetails({ id: 1, type: 'EQUIPMENT_CHANGED', actorId: 2,
    actorNickname: 'Player', targetId: 2, targetNickname: 'Player', payload, createdAt: '2026-10-27T12:00:00Z' })

  it('lists every slot of one game sync in a single entry', () => {
    expect(sync({ action: 'CLIENT_SYNC', slots: ['Helmet', 'Gloves'], changes: [
      { slot: 'Helmet', before: null, after: { name: 'Elmo X' } },
      { slot: 'Gloves', before: { name: 'Luva A' }, after: null },
    ] })).toBe('Sincronizado pelo jogo · Helmet: Elmo X · Gloves: vazio')
  })

  it('formats older per-slot sync entries without an empty record number', () => {
    expect(sync({ action: 'CLIENT_SYNC', slot: 'Shoes', before: null, after: { name: 'Bota Y' } }))
      .toBe('Shoes · Sincronizado pelo jogo: Bota Y')
  })
})
