import { describe, expect, it } from 'vitest'
import { formatEquipmentEffect } from './equipmentEffects'
import type { EquipmentEffect } from '../types'

describe('RF Loot equipment dictionary formats', () => {
  const effect: EquipmentEffect = { code: 15, key: '15:0.08', name: 'Force Attack', value: 0.08, displayType: 'FLAT' }
  it.each([
    ['percent_0_1', 0.08, '8%'], ['percent_0_100', 10, '10%'], ['percent_0_100', 0.1, '10%'],
    ['ms', 500, '500 ms'], ['int', 0.1, '0,1'], ['', 0.08, '8%'], ['', 2, '2'],
  ])('formats %s without losing the raw source value', (unitHint, value, expected) => {
    expect(formatEquipmentEffect({ ...effect, unitHint, value })).toBe(`Force Attack · ${expected}`)
  })
  it('keeps legacy snapshots and no-effect models readable', () => {
    expect(formatEquipmentEffect({ ...effect, displayType: 'PERCENT_100' })).toBe('Force Attack · 8%')
    expect(formatEquipmentEffect({ ...effect, code: null })).toBe('Sem efeito extra')
  })
})
