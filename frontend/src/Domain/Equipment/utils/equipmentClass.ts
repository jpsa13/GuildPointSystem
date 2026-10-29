import type { CatalogFilters } from '../types'

const ARMOR_CLASSES: Record<string, NonNullable<CatalogFilters['equipmentClass']>> = {
  warrior: 'MELEE', melee: 'MELEE', berserker: 'MELEE', armsman: 'MELEE', 'shield miller': 'MELEE',
  'templar knight': 'MELEE', guardian: 'MELEE', 'black knight': 'MELEE', punisher: 'MELEE', assaulter: 'MELEE', mercenary: 'MELEE',
  ranger: 'RANGER', 'hidden soldier': 'RANGER', sentinel: 'RANGER', infiltrator: 'RANGER', adventurer: 'RANGER',
  stealer: 'RANGER', assassin: 'RANGER', 'phantom shadow': 'RANGER',
  force: 'FORCE', spiritualist: 'FORCE', wizard: 'FORCE', astralist: 'FORCE', 'holy chandra': 'FORCE',
  warlock: 'FORCE', 'dark priest': 'FORCE', grazier: 'FORCE',
}

export function armorClassForCharacter(className?: string) {
  return ARMOR_CLASSES[className?.trim().toLowerCase() ?? '']
}

export function playerClassForEquipmentList(className?: string) {
  return ['artist', 'specialist', 'spec', 'specs', 'especialista', 'especialistas', 'mental smith', 'armor rider', 'scientist', 'battle leader']
    .includes(className?.trim().toLowerCase() ?? '') ? 'RANGER' as const : armorClassForCharacter(className)
}

export function weaponClassForCharacter(className?: string) {
  return ['gunner', 'striker', 'dementer'].includes(className?.trim().toLowerCase() ?? '') ? 'LAUNCHER' as const : armorClassForCharacter(className)
}
