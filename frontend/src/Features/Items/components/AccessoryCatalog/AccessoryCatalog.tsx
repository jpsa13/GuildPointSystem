import { useEffect, useMemo, useState } from 'react'
import {
  CATALOG_PAGE_SIZE,
  useAllCatalogSets,
  useCatalogAccessories,
  useCatalogAccessoryIconIndex,
  useCatalogArmor,
  useCatalogArmorIconIndex,
  useCatalogWeapons,
  useCatalogWeaponIconIndex,
} from '@/Domain/Catalog/hooks/useCatalog'
import { civilMaskToRaces, CIVIL_MASK_OPTIONS } from '@/Domain/Catalog/utils/civilMaskUtils'
import {
  armorGradeLabel,
  formatEffectDirection,
  gradeColor,
  GRADE_FILTER_OPTIONS,
  gradeLabel,
  isTimedEffect,
} from '@/Domain/Catalog/utils/catalogUtils'
import { mergeEffects } from '@/Domain/Catalog/utils/effectUtils'
import {
  buildSetIndex,
  deduplicateComboSets,
  getSetMemberSlots,
  type SetMemberSlot,
} from '@/Domain/Catalog/utils/setIndexUtils'
import type {
  CatalogIconRef,
  GameAccessory,
  GameAccessoryEffect,
  GameArmor,
  GameWeapon,
  GameWeaponType,
  ItemSet,
  ItemSetEffect,
} from '@/Domain/types/models'
import { SpriteIcon } from '@/Shared/ui/components/SpriteIcon/SpriteIcon'
import './AccessoryCatalog.styles.scss'

type CatalogMode = 'accessories' | 'armor' | 'weapons'
type SubtypeFilter = 'ALL' | 'RING' | 'AMULET'
type SlotFilter = 'ALL' | GameArmor['slot']
type WeaponTypeFilter = 'ALL' | GameWeaponType
type GradeFilter = 'ALL' | string

const ARMOR_SLOTS: GameArmor['slot'][] = ['HELMET', 'UPPER', 'LOWER', 'GAUNTLET', 'SHOES']

const WEAPON_TYPES: GameWeaponType[] = [
  'KNIFE',
  'SWORD',
  'AXE',
  'HAMMER',
  'SPEAR',
  'BOW',
  'FIREARM',
  'LAUNCHER',
  'THROWING_KNIFE',
  'STAFF',
  'MINING_TOOL',
  'GRENADE_LAUNCHER',
]

const SLOT_LABELS: Record<GameArmor['slot'], string> = {
  HELMET: 'Helmet',
  UPPER: 'Upper',
  LOWER: 'Lower',
  GAUNTLET: 'Gauntlet',
  SHOES: 'Shoes',
}

const WEAPON_TYPE_LABELS: Record<GameWeaponType, string> = {
  KNIFE: 'Knife',
  SWORD: 'Sword',
  AXE: 'Axe',
  HAMMER: 'Hammer',
  SPEAR: 'Spear',
  BOW: 'Bow',
  FIREARM: 'Firearm',
  LAUNCHER: 'Launcher',
  THROWING_KNIFE: 'Throwing Knife',
  STAFF: 'Staff',
  MINING_TOOL: 'Mining Tool',
  GRENADE_LAUNCHER: 'Grenade Launcher',
}

export function ItemCatalog() {
  const [mode, setMode] = useState<CatalogMode>('accessories')
  const [subtype, setSubtype] = useState<SubtypeFilter>('ALL')
  const [slot, setSlot] = useState<SlotFilter>('ALL')
  const [weaponType, setWeaponType] = useState<WeaponTypeFilter>('ALL')
  const [grade, setGrade] = useState<GradeFilter>('ALL')
  const [civilMask, setCivilMask] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [accessoryPage, setAccessoryPage] = useState(0)
  const [armorPage, setArmorPage] = useState(0)
  const [weaponPage, setWeaponPage] = useState(0)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    setSelectedCode(null)
    setAccessoryPage(0)
    setArmorPage(0)
    setWeaponPage(0)
  }, [mode, subtype, slot, weaponType, grade, civilMask, debouncedSearch])

  const accessoryFilters = {
    subtype: subtype === 'ALL' ? undefined : subtype,
    grade: grade === 'ALL' ? undefined : Number(grade),
    civilMask: civilMask || undefined,
    search: debouncedSearch || undefined,
    page: accessoryPage,
    size: CATALOG_PAGE_SIZE,
  }

  const armorFilters = {
    slot: slot === 'ALL' ? undefined : slot,
    grade: grade === 'ALL' ? undefined : Number(grade),
    civilMask: civilMask || undefined,
    minLevel: 35,
    search: debouncedSearch || undefined,
    page: armorPage,
    size: CATALOG_PAGE_SIZE,
  }

  const weaponFilters = {
    weaponType: weaponType === 'ALL' ? undefined : weaponType,
    grade: grade === 'ALL' ? undefined : Number(grade),
    civilMask: civilMask || undefined,
    minLevel: 35,
    search: debouncedSearch || undefined,
    page: weaponPage,
    size: CATALOG_PAGE_SIZE,
  }

  const accessoriesEnabled = mode === 'accessories'
  const armorEnabled = mode === 'armor'
  const weaponsEnabled = mode === 'weapons'

  const { data: accessoryPageData, isLoading: loadingAccessories, isFetching: fetchingAccessories } =
    useCatalogAccessories(accessoryFilters, accessoriesEnabled)
  const accessories = accessoryPageData?.content ?? []
  const accessoryTotalPages = accessoryPageData?.totalPages ?? 0
  const accessoryTotalElements = accessoryPageData?.totalElements ?? 0
  const { data: armorPageData, isLoading: loadingArmor, isFetching: fetchingArmor } =
    useCatalogArmor(armorFilters, armorEnabled)
  const armors = armorPageData?.content ?? []
  const armorTotalPages = armorPageData?.totalPages ?? 0
  const armorTotalElements = armorPageData?.totalElements ?? 0
  const { data: weaponPageData, isLoading: loadingWeapons, isFetching: fetchingWeapons } =
    useCatalogWeapons(weaponFilters, weaponsEnabled)
  const weapons = weaponPageData?.content ?? []
  const weaponTotalPages = weaponPageData?.totalPages ?? 0
  const weaponTotalElements = weaponPageData?.totalElements ?? 0
  const { data: allSets = [] } = useAllCatalogSets(accessoriesEnabled || armorEnabled || weaponsEnabled)
  const { data: accessoryIcons = [] } = useCatalogAccessoryIconIndex(accessoriesEnabled)
  const { data: armorIcons = [] } = useCatalogArmorIconIndex(armorEnabled)
  const { data: weaponIcons = [] } = useCatalogWeaponIconIndex(weaponsEnabled)

  const setIndex = useMemo(() => buildSetIndex(allSets), [allSets])
  const catalogByCode = useMemo(() => {
    const map = new Map<string, CatalogIconRef>()
    for (const item of accessoryIcons) {
      map.set(item.gameCode, item)
    }
    for (const item of armorIcons) {
      map.set(item.gameCode, item)
    }
    for (const item of weaponIcons) {
      map.set(item.gameCode, item)
    }
    return map
  }, [accessoryIcons, armorIcons, weaponIcons])

  const isLoading =
    mode === 'accessories'
      ? loadingAccessories && !accessoryPageData
      : mode === 'armor'
        ? loadingArmor && !armorPageData
        : loadingWeapons && !weaponPageData

  return (
    <div className="accessory-catalog">
      <div className="accessory-catalog__mode-tabs">
        <button
          type="button"
          className={`accessory-catalog__mode-btn${mode === 'accessories' ? ' accessory-catalog__mode-btn--active' : ''}`}
          onClick={() => setMode('accessories')}
        >
          Acessórios
        </button>
        <button
          type="button"
          className={`accessory-catalog__mode-btn${mode === 'armor' ? ' accessory-catalog__mode-btn--active' : ''}`}
          onClick={() => setMode('armor')}
        >
          Armaduras
        </button>
        <button
          type="button"
          className={`accessory-catalog__mode-btn${mode === 'weapons' ? ' accessory-catalog__mode-btn--active' : ''}`}
          onClick={() => setMode('weapons')}
        >
          Armas
        </button>
      </div>

      <div className="accessory-catalog__filters">
        <input
          type="search"
          className="accessory-catalog__search"
          placeholder="Buscar por nome ou código..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {mode === 'accessories' ? (
          <select
            className="accessory-catalog__select"
            value={subtype}
            onChange={(e) => setSubtype(e.target.value as SubtypeFilter)}
          >
            <option value="ALL">Todos os tipos</option>
            <option value="RING">Ring</option>
            <option value="AMULET">Amulet</option>
          </select>
        ) : mode === 'armor' ? (
          <select
            className="accessory-catalog__select"
            value={slot}
            onChange={(e) => setSlot(e.target.value as SlotFilter)}
          >
            <option value="ALL">Todos os slots</option>
            {ARMOR_SLOTS.map((s) => (
              <option key={s} value={s}>{SLOT_LABELS[s]}</option>
            ))}
          </select>
        ) : (
          <select
            className="accessory-catalog__select"
            value={weaponType}
            onChange={(e) => setWeaponType(e.target.value as WeaponTypeFilter)}
          >
            <option value="ALL">Todos os tipos</option>
            {WEAPON_TYPES.map((type) => (
              <option key={type} value={type}>{WEAPON_TYPE_LABELS[type]}</option>
            ))}
          </select>
        )}

        <select
          className="accessory-catalog__select"
          value={grade}
          onChange={(e) => setGrade(e.target.value as GradeFilter)}
        >
          <option value="ALL">Todas as qualidades</option>
          {GRADE_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <select
          className="accessory-catalog__select"
          value={civilMask}
          onChange={(e) => setCivilMask(e.target.value)}
        >
          <option value="">Todas as raças</option>
          {CIVIL_MASK_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <p className="accessory-catalog__status">Carregando catálogo...</p>
      ) : mode === 'accessories' ? (
        accessories.length === 0 ? (
          <p className="accessory-catalog__status">Nenhum acessório encontrado.</p>
        ) : (
          <>
            <div className="accessory-catalog__grid">
              {accessories.map((accessory) => (
                <AccessoryCard
                  key={accessory.gameCode}
                  accessory={accessory}
                  sets={setIndex.get(accessory.gameCode) ?? []}
                  catalogByCode={catalogByCode}
                  selected={selectedCode === accessory.gameCode}
                  onSelect={() =>
                    setSelectedCode(
                      selectedCode === accessory.gameCode ? null : accessory.gameCode
                    )
                  }
                />
              ))}
            </div>
            {accessoryTotalPages > 1 && (
              <div className="accessory-catalog__pagination">
                <button
                  type="button"
                  className="accessory-catalog__page-btn"
                  disabled={accessoryPage === 0 || fetchingAccessories}
                  onClick={() => setAccessoryPage((p) => Math.max(0, p - 1))}
                >
                  Anterior
                </button>
                <span className="accessory-catalog__page-info">
                  Página {accessoryPage + 1} de {accessoryTotalPages}
                  <span className="accessory-catalog__page-count">
                    ({accessoryTotalElements} itens)
                  </span>
                </span>
                <button
                  type="button"
                  className="accessory-catalog__page-btn"
                  disabled={accessoryPage >= accessoryTotalPages - 1 || fetchingAccessories}
                  onClick={() => setAccessoryPage((p) => p + 1)}
                >
                  Próxima
                </button>
              </div>
            )}
          </>
        )
      ) : mode === 'armor' ? (
        armors.length === 0 ? (
          <p className="accessory-catalog__status">Nenhuma armadura encontrada (Lv 35+).</p>
        ) : (
          <>
            <div className="accessory-catalog__grid">
              {armors.map((armor) => (
                <ArmorCard
                  key={armor.gameCode}
                  armor={armor}
                  sets={setIndex.get(armor.gameCode) ?? []}
                  catalogByCode={catalogByCode}
                  selected={selectedCode === armor.gameCode}
                  onSelect={() =>
                    setSelectedCode(
                      selectedCode === armor.gameCode ? null : armor.gameCode
                    )
                  }
                />
              ))}
            </div>
            {armorTotalPages > 1 && (
              <div className="accessory-catalog__pagination">
                <button
                  type="button"
                  className="accessory-catalog__page-btn"
                  disabled={armorPage === 0 || fetchingArmor}
                  onClick={() => setArmorPage((p) => Math.max(0, p - 1))}
                >
                  Anterior
                </button>
                <span className="accessory-catalog__page-info">
                  Página {armorPage + 1} de {armorTotalPages}
                  <span className="accessory-catalog__page-count">
                    ({armorTotalElements} itens)
                  </span>
                </span>
                <button
                  type="button"
                  className="accessory-catalog__page-btn"
                  disabled={armorPage >= armorTotalPages - 1 || fetchingArmor}
                  onClick={() => setArmorPage((p) => p + 1)}
                >
                  Próxima
                </button>
              </div>
            )}
          </>
        )
      ) : weapons.length === 0 ? (
        <p className="accessory-catalog__status">Nenhuma arma encontrada (Lv 35+).</p>
      ) : (
        <>
          <div className="accessory-catalog__grid">
            {weapons.map((weapon) => (
              <WeaponCard
                key={weapon.gameCode}
                weapon={weapon}
                sets={setIndex.get(weapon.gameCode) ?? []}
                catalogByCode={catalogByCode}
                selected={selectedCode === weapon.gameCode}
                onSelect={() =>
                  setSelectedCode(
                    selectedCode === weapon.gameCode ? null : weapon.gameCode
                  )
                }
              />
            ))}
          </div>
          {weaponTotalPages > 1 && (
            <div className="accessory-catalog__pagination">
              <button
                type="button"
                className="accessory-catalog__page-btn"
                disabled={weaponPage === 0 || fetchingWeapons}
                onClick={() => setWeaponPage((p) => Math.max(0, p - 1))}
              >
                Anterior
              </button>
              <span className="accessory-catalog__page-info">
                Página {weaponPage + 1} de {weaponTotalPages}
                <span className="accessory-catalog__page-count">
                  ({weaponTotalElements} itens)
                </span>
              </span>
              <button
                type="button"
                className="accessory-catalog__page-btn"
                disabled={weaponPage >= weaponTotalPages - 1 || fetchingWeapons}
                onClick={() => setWeaponPage((p) => p + 1)}
              >
                Próxima
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** @deprecated Use ItemCatalog */
export const AccessoryCatalog = ItemCatalog

function ElementBadges({ fire, water, soil, wind }: { fire: number; water: number; soil: number; wind: number }) {
  const elements = [
    { label: 'Fire', value: fire, cls: 'fire' },
    { label: 'Water', value: water, cls: 'water' },
    { label: 'Soil', value: soil, cls: 'soil' },
    { label: 'Wind', value: wind, cls: 'wind' },
  ].filter((e) => e.value > 0)

  if (elements.length === 0) return null

  return (
    <div className="accessory-card__elements">
      {elements.map((el) => (
        <span key={el.cls} className={`accessory-card__element accessory-card__element--${el.cls}`}>
          {el.label} {el.value}
        </span>
      ))}
    </div>
  )
}

function EffectLine({ eff }: { eff: GameAccessoryEffect | ItemSetEffect }) {
  if (eff.displayType === 'BOOLEAN') {
    return <span className="accessory-card__effect">{eff.name}</span>
  }

  const direction = formatEffectDirection(eff.displayType, eff.rawValue)

  if (isTimedEffect(eff.displayType) && direction) {
    const dirClass = `accessory-card__effect-dir accessory-card__effect-dir--${direction.toLowerCase()}`

    if (eff.code === 34) {
      return (
        <span className="accessory-card__effect">
          {eff.name} is{' '}
          <strong>{eff.displayValue}</strong>{' '}
          <span className={dirClass}>{direction}</span>(Sec)
        </span>
      )
    }

    return (
      <span className="accessory-card__effect">
        {eff.name}{' '}
        <strong>{eff.displayValue}</strong>{' '}
        <span className={dirClass}>{direction}</span>(Sec)
      </span>
    )
  }

  return (
    <span className="accessory-card__effect">
      {eff.name}{' '}
      {direction && (
        <span className={`accessory-card__effect-dir accessory-card__effect-dir--${direction.toLowerCase()}`}>
          {direction}
        </span>
      )}{' '}
      <strong>{eff.displayValue}</strong>
    </span>
  )
}

function ComboMemberIcon({
  member,
  catalogByCode,
}: {
  member: SetMemberSlot
  catalogByCode: Map<string, CatalogIconRef>
}) {
  const catalogItem = catalogByCode.get(member.gameCode)

  if (catalogItem) {
    return (
      <span className="accessory-card__combo-icon" title={catalogItem.name}>
        <SpriteIcon iconId={catalogItem.iconId} spriteSheet={catalogItem.spriteSheet} size={24} />
      </span>
    )
  }

  return (
    <span
      className="accessory-card__combo-icon accessory-card__combo-icon--placeholder"
      title={member.gameCode}
    >
      <span className="accessory-card__combo-icon-label">?</span>
    </span>
  )
}

function ComboSetBlock({
  set,
  catalogByCode,
}: {
  set: ItemSet
  catalogByCode: Map<string, CatalogIconRef>
}) {
  const members = getSetMemberSlots(set)
  const mergedEffects = mergeEffects(set.effects)

  if (members.length === 0 && mergedEffects.length === 0) return null

  return (
    <div className="accessory-card__combo-set">
      {members.length > 0 && (
        <div className="accessory-card__combo-items">
          {members.map((member, index) => (
            <ComboMemberIcon
              key={`${set.id}-${member.slot}-${index}`}
              member={member}
              catalogByCode={catalogByCode}
            />
          ))}
        </div>
      )}
      {mergedEffects.map((eff) => (
        <EffectLine key={`${set.id}-${eff.code}-${eff.displayType}`} eff={eff} />
      ))}
    </div>
  )
}

function RaceTags({ civilMask }: { civilMask: string | null | undefined }) {
  const races = civilMaskToRaces(civilMask)
  if (races.length === 0) return null

  if (races.length === 3) {
    return (
      <span className="accessory-card__tag accessory-card__tag--race">
        All Races
      </span>
    )
  }

  return (
    <>
      {races.map((race) => (
        <span key={race} className="accessory-card__tag accessory-card__tag--race">
          {race}
        </span>
      ))}
    </>
  )
}

function AccessoryCard({
  accessory,
  sets,
  catalogByCode,
  selected,
  onSelect,
}: {
  accessory: GameAccessory
  sets: ItemSet[]
  catalogByCode: Map<string, CatalogIconRef>
  selected: boolean
  onSelect: () => void
}) {
  const comboSets = deduplicateComboSets(sets.filter((set) => set.effects.length > 0))

  return (
    <button
      type="button"
      className={`accessory-card${selected ? ' accessory-card--selected' : ''}`}
      onClick={onSelect}
    >
      <div className="accessory-card__header">
        <div className="accessory-card__icon">
          <SpriteIcon iconId={accessory.iconId} spriteSheet={accessory.spriteSheet} size={36} />
        </div>
        <div className="accessory-card__title-group">
          <span className="accessory-card__name" style={{ color: gradeColor(accessory.grade) }}>
            {accessory.name}
          </span>
          <div className="accessory-card__tags">
            <span className="accessory-card__tag">{accessory.subtype}</span>
            <span className="accessory-card__tag accessory-card__tag--grade" style={{ color: gradeColor(accessory.grade) }}>
              {gradeLabel(accessory.grade)}
            </span>
            <span className="accessory-card__tag">Lv {accessory.levelRequired}</span>
            <RaceTags civilMask={accessory.civilMask} />
          </div>
        </div>
      </div>

      <div className="accessory-card__body">
        <ElementBadges
          fire={accessory.fire}
          water={accessory.water}
          soil={accessory.soil}
          wind={accessory.wind}
        />

        {accessory.effects.length > 0 && (
          <div className="accessory-card__effects">
            {mergeEffects(accessory.effects).map((eff) => (
              <EffectLine key={`${eff.code}-${eff.displayType}`} eff={eff} />
            ))}
          </div>
        )}

        {comboSets.length > 0 && (
          <div className="accessory-card__combo">
            <span className="accessory-card__combo-label">Combo</span>
            {comboSets.map((set) => (
              <ComboSetBlock key={set.id} set={set} catalogByCode={catalogByCode} />
            ))}
          </div>
        )}
      </div>
    </button>
  )
}

function ArmorCard({
  armor,
  sets,
  catalogByCode,
  selected,
  onSelect,
}: {
  armor: GameArmor
  sets: ItemSet[]
  catalogByCode: Map<string, CatalogIconRef>
  selected: boolean
  onSelect: () => void
}) {
  const comboSets = deduplicateComboSets(sets.filter((set) => set.effects.length > 0))
  const gradeName = armorGradeLabel(armor.grade)

  return (
    <button
      type="button"
      className={`accessory-card${selected ? ' accessory-card--selected' : ''}`}
      onClick={onSelect}
    >
      <div className="accessory-card__header">
        <div className="accessory-card__icon">
          <SpriteIcon iconId={armor.iconId} spriteSheet={armor.spriteSheet} size={36} />
        </div>
        <div className="accessory-card__title-group">
          <span className="accessory-card__name" style={{ color: gradeColor(armor.grade) }}>
            {armor.name}
          </span>
          <div className="accessory-card__tags">
            <span className="accessory-card__tag">{SLOT_LABELS[armor.slot]}</span>
            <span className="accessory-card__tag accessory-card__tag--grade" style={{ color: gradeColor(armor.grade) }}>
              {gradeName}
            </span>
            <span className="accessory-card__tag">Lv {armor.levelRequired}</span>
            <RaceTags civilMask={armor.civilMask} />
          </div>
        </div>
      </div>

      <div className="accessory-card__body">
        <div className="accessory-card__def-stats">
          <span className="accessory-card__def-stat">
            Avg. Def. Pwr. <strong>{armor.defFc}</strong>
          </span>
          {armor.defFacingDisplay != null && (
            <span className="accessory-card__def-stat">
              Defense Success Rate <strong>{armor.defFacingDisplay}</strong>
            </span>
          )}
        </div>

        {armor.effects.length > 0 && (
          <div className="accessory-card__effects">
            {mergeEffects(armor.effects).map((eff) => (
              <EffectLine key={`${eff.code}-${eff.displayType}`} eff={eff} />
            ))}
          </div>
        )}

        {comboSets.length > 0 && (
          <div className="accessory-card__combo">
            <span className="accessory-card__combo-label">Combo</span>
            {comboSets.map((set) => (
              <ComboSetBlock key={set.id} set={set} catalogByCode={catalogByCode} />
            ))}
          </div>
        )}
      </div>
    </button>
  )
}

function WeaponCard({
  weapon,
  sets,
  catalogByCode,
  selected,
  onSelect,
}: {
  weapon: GameWeapon
  sets: ItemSet[]
  catalogByCode: Map<string, CatalogIconRef>
  selected: boolean
  onSelect: () => void
}) {
  const comboSets = deduplicateComboSets(sets.filter((set) => set.effects.length > 0))
  const gradeName = armorGradeLabel(weapon.grade)
  const hasGa = weapon.gaMaxAf > 0
  const hasMa = weapon.maMaxAf > 0

  return (
    <button
      type="button"
      className={`accessory-card${selected ? ' accessory-card--selected' : ''}`}
      onClick={onSelect}
    >
      <div className="accessory-card__header">
        <div className="accessory-card__icon">
          <SpriteIcon
            iconId={weapon.iconId}
            spriteSheet={weapon.spriteSheet}
            spriteCols={weapon.spriteCols}
            size={36}
          />
        </div>
        <div className="accessory-card__title-group">
          <span className="accessory-card__name" style={{ color: gradeColor(weapon.grade) }}>
            {weapon.name}
          </span>
          <div className="accessory-card__tags">
            <span className="accessory-card__tag">{WEAPON_TYPE_LABELS[weapon.weaponType]}</span>
            <span className="accessory-card__tag accessory-card__tag--grade" style={{ color: gradeColor(weapon.grade) }}>
              {gradeName}
            </span>
            <span className="accessory-card__tag">Lv {weapon.levelRequired}</span>
            <RaceTags civilMask={weapon.civilMask} />
          </div>
        </div>
      </div>

      <div className="accessory-card__body">
        {(hasGa || hasMa) && (
          <div className="accessory-card__def-stats">
            {hasGa && (
              <span className="accessory-card__def-stat">
                Attack <strong>{weapon.gaMinAf} – {weapon.gaMaxAf}</strong>
              </span>
            )}
            {hasMa && (
              <span className="accessory-card__def-stat">
                Force Attack <strong>{weapon.maMinAf} – {weapon.maMaxAf}</strong>
              </span>
            )}
          </div>
        )}

        {weapon.effects.length > 0 && (
          <div className="accessory-card__effects">
            {mergeEffects(weapon.effects).map((eff) => (
              <EffectLine key={`${eff.code}-${eff.displayType}`} eff={eff} />
            ))}
          </div>
        )}

        {comboSets.length > 0 && (
          <div className="accessory-card__combo">
            <span className="accessory-card__combo-label">Combo</span>
            {comboSets.map((set) => (
              <ComboSetBlock key={set.id} set={set} catalogByCode={catalogByCode} />
            ))}
          </div>
        )}
      </div>
    </button>
  )
}
