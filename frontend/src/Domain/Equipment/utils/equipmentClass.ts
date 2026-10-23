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
