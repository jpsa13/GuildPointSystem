import { describe, expect, it } from 'vitest'
import { armorClassForCharacter, weaponClassForCharacter } from './equipmentClass'

describe('armorClassForCharacter', () => {
  it.each(['Gunner', 'Striker', 'Dementer'])('uses launcher weapons but keeps armor unfiltered for %s', name => {
    expect(weaponClassForCharacter(name)).toBe('LAUNCHER')
    expect(armorClassForCharacter(name)).toBeUndefined()
  })
  it.each(['Warrior', 'Berserker', 'Armsman', 'Shield Miller', 'Templar Knight', 'Guardian', 'Black Knight', 'Punisher', 'Assaulter', 'Mercenary'])('maps %s to melee', name => expect(armorClassForCharacter(name)).toBe('MELEE'))
  it.each(['Ranger', 'Hidden Soldier', 'Sentinel', 'Infiltrator', 'Adventurer', 'Stealer', 'Assassin', 'Phantom Shadow'])('maps %s to ranger', name => expect(armorClassForCharacter(name)).toBe('RANGER'))
  it.each(['Spiritualist', 'Wizard', 'Astralist', 'Holy Chandra', 'Warlock', 'Dark Priest', 'Grazier'])('maps %s to force', name => expect(armorClassForCharacter(name)).toBe('FORCE'))
  it('normalizes names and leaves specialists or missing classes unfiltered', () => {
    expect(armorClassForCharacter('  BLACK KNIGHT ')).toBe('MELEE')
    for (const name of [undefined, '', 'Artist', 'Mental Smith', 'Armor Rider', 'Scientist', 'Battle Leader', 'Striker', 'Dementer']) expect(armorClassForCharacter(name)).toBeUndefined()
  })
})
