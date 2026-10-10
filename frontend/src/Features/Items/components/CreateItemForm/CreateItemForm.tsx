import { useState, useRef, useEffect } from 'react'
import type { GameLuaItem, ItemType } from '@/Domain/types/models'
import type { CreateItemPayload } from '@/Domain/Item/hooks/useItems'
import { useCreateItem, useItem, useUpdateItem } from '@/Domain/Item/hooks/useItems'
import { GameRefPicker } from '@/Features/Items/components/GameRefPicker/GameRefPicker'
import { TALIC_BONUS_PCT, applyBonus } from '@/Domain/Item/utils/talicUtils'
import { useItemSeeds } from '@/Domain/Seed/hooks/useItemSeeds'
import { useRaces } from '@/Domain/Seed/hooks/useSeeds'
import { useUploadImage } from '@/Domain/Upload/hooks/useUpload'
import { Button } from '@/Shared/ui/components/Button/Button'
import { Panel } from '@/Shared/ui/components/Panel/Panel'
import { CastPicker } from '@/Features/Items/components/CastPicker/CastPicker'
import { useAppToast } from '@/Shared/ui/components/AppToast/AppToast'
import './CreateItemForm.styles.scss'

// ─── Talic definitions ────────────────────────────────────────────────────────

type WeaponTalicType = 'KEEN' | 'SACREDFIRE' | 'BELIEF' | 'GUARD' | 'GLORY'
type ArmorTalicType = 'FAVOR' | 'WISDOM' | 'GRACE' | 'DARKNESS' | 'MERCY'

const TALIC_IMAGES: Record<string, string> = {
  KEEN:       '/talics/keen.png',
  SACREDFIRE: '/talics/sacredfire.png',
  BELIEF:     '/talics/belief.png',
  GUARD:      '/talics/guard.png',
  GLORY:      '/talics/glory.png',
  FAVOR:      '/talics/favor.png',
  WISDOM:     '/talics/wisdom.png',
  GRACE:      '/talics/grace.png',
  DARKNESS:   '/talics/darkness.png',
  MERCY:      '/talics/mercy.png',
}

const WEAPON_TALIC_OPTIONS: { value: WeaponTalicType; label: string }[] = [
  { value: 'KEEN',       label: 'Keen' },
  { value: 'SACREDFIRE', label: 'Sacredfire (Fogo)' },
  { value: 'BELIEF',     label: 'Belief (Água)' },
  { value: 'GUARD',      label: 'Guard (Terra)' },
  { value: 'GLORY',      label: 'Glory (Vento)' },
]

const ARMOR_EXCLUSIVE_MAP: Record<string, { value: ArmorTalicType; label: string }[]> = {
  Helmet: [{ value: 'WISDOM',   label: 'Wisdom' }],
  Gloves: [
    { value: 'GRACE',    label: 'Grace' },
    { value: 'DARKNESS', label: 'Darkness' },
  ],
  Shoes:  [{ value: 'MERCY',    label: 'Mercy' }],
}

const TALIC_SLOT_COUNT = 7

// ─── Slot data model ─────────────────────────────────────────────────────────

type WeaponSlot = { type: WeaponTalicType } | null
type ArmorSlot  = { type: 'FAVOR' | ArmorTalicType } | null

function isElemental(t: WeaponTalicType | null | undefined): boolean {
  return t === 'SACREDFIRE' || t === 'BELIEF' || t === 'GUARD' || t === 'GLORY'
}

// ─── ImageUploader ────────────────────────────────────────────────────────────

function ImageUploader({
  preview,
  error,
  onChange,
  onRemove,
}: {
  preview: string | null
  error: string | null
  onChange: (file: File) => void
  onRemove: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleFile = (file: File | undefined) => {
    if (!file) return
    onChange(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files[0])
  }

  if (preview) {
    return (
      <div className="image-uploader image-uploader--has-preview">
        <img src={preview} alt="Preview" className="image-uploader__preview" />
        <button
          type="button"
          className="image-uploader__remove"
          onClick={onRemove}
          title="Remover imagem"
        >
          ×
        </button>
      </div>
    )
  }

  return (
    <div
      className={`image-uploader${dragging ? ' image-uploader--drag' : ''}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <svg className="image-uploader__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
      <span className="image-uploader__label">Clique ou arraste uma imagem</span>
      <span className="image-uploader__hint">JPG, PNG, WEBP</span>
      {error && <span className="image-uploader__error">{error}</span>}
    </div>
  )
}

// ─── TalicSlotPicker ──────────────────────────────────────────────────────────

type TalicOption = { value: string; label: string }

function TalicSlotPicker({
  slotIndex,
  anchorRect,
  options,
  onSelect,
  onClose,
}: {
  slotIndex: number
  anchorRect: DOMRect
  options: TalicOption[]
  onSelect: (value: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const left = anchorRect.left + anchorRect.width / 2

  return (
    <div
      ref={ref}
      className="talic-picker"
      data-slot={slotIndex}
      style={{ bottom: `calc(100vh - ${anchorRect.top}px + 6px)`, left, transform: 'translateX(-50%)' }}
    >
      <div className="talic-picker__header">Slot {slotIndex + 1}</div>
      <button
        type="button"
        className="talic-picker__option talic-picker__option--empty"
        onClick={() => onSelect('')}
      >
        Remover
      </button>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className="talic-picker__option"
          onClick={() => onSelect(opt.value)}
        >
          <img
            src={TALIC_IMAGES[opt.value]}
            alt={opt.label}
            className="talic-picker__img"
          />
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ─── WeaponTalicSlots ─────────────────────────────────────────────────────────

function WeaponTalicSlots({
  slots,
  onChange,
}: {
  slots: WeaponSlot[]
  onChange: (slots: WeaponSlot[]) => void
}) {
  const [openSlot, setOpenSlot] = useState<number | null>(null)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)

  const hasElemental = slots.some((s) => s && isElemental(s.type))

  const availableOptions = (slotIdx: number): TalicOption[] => {
    const currentType = slots[slotIdx]?.type
    return WEAPON_TALIC_OPTIONS.filter((opt) => {
      if (!isElemental(opt.value)) return true
      if (currentType && isElemental(currentType)) return true
      return !hasElemental
    })
  }

  const handleToggle = (i: number, e: React.MouseEvent<HTMLButtonElement>) => {
    if (openSlot === i) {
      setOpenSlot(null)
      setAnchorRect(null)
    } else {
      setAnchorRect(e.currentTarget.getBoundingClientRect())
      setOpenSlot(i)
    }
  }

  const handleSelect = (slotIdx: number, value: string) => {
    const next = [...slots]
    next[slotIdx] = value ? { type: value as WeaponTalicType } : null
    onChange(next)
    setOpenSlot(null)
    setAnchorRect(null)
  }

  return (
    <div className="talic-slots">
      <span className="talic-slots__label">Talics</span>
      <div className="talic-slots__row">
        {slots.map((slot, i) => (
          <div key={i} className="talic-slots__slot-wrap">
            <button
              type="button"
              className={`talic-slots__slot${slot ? ' talic-slots__slot--filled' : ''}${openSlot === i ? ' talic-slots__slot--open' : ''}`}
              onClick={(e) => handleToggle(i, e)}
              title={slot ? WEAPON_TALIC_OPTIONS.find((o) => o.value === slot.type)?.label : `Slot ${i + 1} vazio`}
            >
              <img
                src={slot ? TALIC_IMAGES[slot.type] : '/talics/empty.svg'}
                alt={slot ? slot.type : 'empty'}
                className="talic-slots__img"
              />
            </button>
          </div>
        ))}
      </div>
      {openSlot !== null && anchorRect && (
        <TalicSlotPicker
          slotIndex={openSlot}
          anchorRect={anchorRect}
          options={availableOptions(openSlot)}
          onSelect={(v) => handleSelect(openSlot, v)}
          onClose={() => { setOpenSlot(null); setAnchorRect(null) }}
        />
      )}
      {(() => {
        const keenCount = slots.filter(s => s?.type === 'KEEN').length
        const keenPct = TALIC_BONUS_PCT[keenCount]
        const elementalSlot = slots.find(s => s && isElemental(s.type))
        if (keenCount === 0 && !elementalSlot) return null
        return (
          <div className="talic-slots__legend">
            {keenCount > 0 && (
              <span className="talic-slots__tag">
                <img src={TALIC_IMAGES.KEEN} alt="Keen" className="talic-slots__tag-img" />
                <span>Keen Lv{keenCount}</span>
                <span className="talic-slots__tag-bonus">+{keenPct}% ATK</span>
              </span>
            )}
            {elementalSlot && (
              <span className="talic-slots__tag">
                <img src={TALIC_IMAGES[elementalSlot.type]} alt={elementalSlot.type} className="talic-slots__tag-img" />
                <span>{WEAPON_TALIC_OPTIONS.find(o => o.value === elementalSlot.type)?.label}</span>
              </span>
            )}
          </div>
        )
      })()}
    </div>
  )
}

// ─── ArmorTalicSlots ──────────────────────────────────────────────────────────

function ArmorTalicSlots({
  slots,
  armorSubtype,
  onChange,
}: {
  slots: ArmorSlot[]
  armorSubtype: string
  onChange: (slots: ArmorSlot[]) => void
}) {
  const [openSlot, setOpenSlot] = useState<number | null>(null)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)

  const exclusiveOpts = ARMOR_EXCLUSIVE_MAP[armorSubtype] ?? []
  const hasExclusive = slots.some((s) => s && s.type !== 'FAVOR')

  const favorOption: TalicOption = { value: 'FAVOR', label: 'Favor' }

  const availableOptions = (slotIdx: number): TalicOption[] => {
    const currentType = slots[slotIdx]?.type
    const opts: TalicOption[] = [favorOption]
    if (exclusiveOpts.length > 0) {
      exclusiveOpts.forEach((opt) => {
        if ((currentType && currentType === opt.value) || !hasExclusive) {
          opts.push(opt)
        }
      })
    }
    return opts
  }

  const handleToggle = (i: number, e: React.MouseEvent<HTMLButtonElement>) => {
    if (openSlot === i) {
      setOpenSlot(null)
      setAnchorRect(null)
    } else {
      setAnchorRect(e.currentTarget.getBoundingClientRect())
      setOpenSlot(i)
    }
  }

  const handleSelect = (slotIdx: number, value: string) => {
    const next = [...slots]
    next[slotIdx] = value ? { type: value as ArmorTalicType } : null
    onChange(next)
    setOpenSlot(null)
    setAnchorRect(null)
  }

  return (
    <div className="talic-slots">
      <span className="talic-slots__label">Talics</span>
      <div className="talic-slots__row">
        {slots.map((slot, i) => (
          <div key={i} className="talic-slots__slot-wrap">
            <button
              type="button"
              className={`talic-slots__slot${slot ? ' talic-slots__slot--filled' : ''}${openSlot === i ? ' talic-slots__slot--open' : ''}`}
              onClick={(e) => handleToggle(i, e)}
              title={slot ? slot.type : `Slot ${i + 1} vazio`}
            >
              <img
                src={slot ? TALIC_IMAGES[slot.type] : '/talics/empty.svg'}
                alt={slot ? slot.type : 'empty'}
                className="talic-slots__img"
              />
            </button>
          </div>
        ))}
      </div>
      {openSlot !== null && anchorRect && (
        <TalicSlotPicker
          slotIndex={openSlot}
          anchorRect={anchorRect}
          options={availableOptions(openSlot)}
          onSelect={(v) => handleSelect(openSlot, v)}
          onClose={() => { setOpenSlot(null); setAnchorRect(null) }}
        />
      )}
    </div>
  )
}

// ─── SpecialEffectsField ──────────────────────────────────────────────────────

function SpecialEffectsField({
  effects,
  onChange,
}: {
  effects: string[]
  onChange: (effects: string[]) => void
}) {
  const update = (index: number, value: string) => {
    const next = [...effects]
    next[index] = value
    onChange(next)
  }

  const add = () => {
    if (effects.length >= 4) return
    onChange([...effects, ''])
  }

  const remove = (index: number) => {
    onChange(effects.filter((_, i) => i !== index))
  }

  return (
    <fieldset className="create-item-form__fieldset">
      <legend>Efeitos especiais (até 4)</legend>
      {effects.map((effect, index) => (
        <div key={index} className="create-item-form__effect-row">
          <input
            value={effect}
            onChange={(e) => update(index, e.target.value)}
            placeholder={`Efeito ${index + 1}`}
          />
          <button type="button" className="create-item-form__remove-btn" onClick={() => remove(index)}>
            ×
          </button>
        </div>
      ))}
      {effects.length < 4 && (
        <button type="button" className="create-item-form__add-btn" onClick={add}>
          + Adicionar efeito
        </button>
      )}
    </fieldset>
  )
}

// ─── Helpers to convert slot arrays → API payload ────────────────────────────

function weaponSlotsToTalics(slots: WeaponSlot[]): CreateItemPayload['talics'] {
  const talics: NonNullable<CreateItemPayload['talics']> = []
  const keenCount = slots.filter((s) => s?.type === 'KEEN').length
  if (keenCount > 0) talics.push({ talicType: 'KEEN', level: keenCount, slot: 0 })

  const elementalSlot = slots.findIndex((s) => s && isElemental(s.type))
  if (elementalSlot !== -1) {
    talics.push({ talicType: slots[elementalSlot]!.type, level: 1, slot: elementalSlot })
  }
  return talics.length > 0 ? talics : undefined
}

function armorSlotsToTalics(slots: ArmorSlot[]): CreateItemPayload['talics'] {
  const talics: NonNullable<CreateItemPayload['talics']> = []
  const favorCount = slots.filter((s) => s?.type === 'FAVOR').length
  if (favorCount > 0) talics.push({ talicType: 'FAVOR', level: favorCount, slot: 0 })

  const exclusiveSlot = slots.findIndex((s) => s && s.type !== 'FAVOR')
  if (exclusiveSlot !== -1) {
    talics.push({ talicType: slots[exclusiveSlot]!.type, level: 1, slot: exclusiveSlot })
  }
  return talics.length > 0 ? talics : undefined
}

// ─── CreateItemForm ───────────────────────────────────────────────────────────

function accessorySubtypeValue(name: string): string {
  return name.toUpperCase()
}

function InputWithBoost({
  value,
  onChange,
  pct,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type' | 'min'> & {
  value: number
  onChange: (v: number) => void
  pct: number
}) {
  const boosted = pct > 0 && value > 0 ? applyBonus(value, pct) : null
  return (
    <div className="input-boost-wrap">
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={boosted ? 'input-boost-wrap__input--has-suffix' : undefined}
        {...props}
      />
      {boosted !== null && (
        <span className="input-boost-wrap__suffix">({boosted})</span>
      )}
    </div>
  )
}

export function CreateItemForm({
  onSuccess,
  onCancel,
  itemId,
}: {
  onSuccess?: () => void
  onCancel?: () => void
  itemId?: number
} = {}) {
  const isEdit = itemId != null && itemId > 0
  const { data: editItem } = useItem(itemId ?? 0)
  const createItem = useCreateItem()
  const updateItem = useUpdateItem()
  const uploadImage = useUploadImage()
  const { showToast } = useAppToast()

  const [type, setType] = useState<ItemType>('WEAPON')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const [weaponRarity, setWeaponRarity] = useState('')
  const [weaponLevel, setWeaponLevel] = useState(1)
  const [weaponSubtype, setWeaponSubtype] = useState('')
  const [attackMin, setAttackMin] = useState(0)
  const [attackMax, setAttackMax] = useState(0)
  const [forceAttackMin, setForceAttackMin] = useState(0)
  const [forceAttackMax, setForceAttackMax] = useState(0)
  const [castSeedId, setCastSeedId] = useState(0)
  const [weaponEffects, setWeaponEffects] = useState<string[]>([])
  const [weaponSlots, setWeaponSlots] = useState<WeaponSlot[]>(
    Array(TALIC_SLOT_COUNT).fill(null)
  )

  const [armorRarity, setArmorRarity] = useState('')
  const [armorLevel, setArmorLevel] = useState(1)
  const [armorSubtype, setArmorSubtype] = useState('')
  const [armorClass, setArmorClass] = useState('')
  const [avgDefPower, setAvgDefPower] = useState(0)
  const [defenseSuccessRate, setDefenseSuccessRate] = useState(0)
  const [armorEffects, setArmorEffects] = useState<string[]>([])
  const [armorSlots, setArmorSlots] = useState<ArmorSlot[]>(
    Array(TALIC_SLOT_COUNT).fill(null)
  )

  const [raceId, setRaceId] = useState(0)
  const [accessorySubtype, setAccessorySubtype] = useState('')
  const [accessoryEffects, setAccessoryEffects] = useState<string[]>([])
  const [gameRef, setGameRef] = useState<GameLuaItem | null>(null)
  const [formKey, setFormKey] = useState(0)
  const [prefilledId, setPrefilledId] = useState<number | null>(null)

  const { data: weaponRarities = [] } = useItemSeeds('WEAPON_RARITY', type === 'WEAPON')
  const { data: armorRarities = [] } = useItemSeeds('ARMOR_RARITY', type === 'ARMOR')
  const { data: weaponSubtypes = [] } = useItemSeeds('WEAPON_SUBTYPE', type === 'WEAPON')
  const { data: armorSubtypes = [] } = useItemSeeds('ARMOR_SUBTYPE', type === 'ARMOR')
  const { data: armorClasses = [] } = useItemSeeds('ARMOR_CLASS', type === 'ARMOR')
  const { data: accessorySubtypes = [] } = useItemSeeds('ACCESSORY_SUBTYPE', type === 'ACCESSORY')
  const { data: weaponCasts = [] } = useItemSeeds('WEAPON_CAST', type === 'WEAPON')
  const { data: races = [] } = useRaces()

  const selectedCast = weaponCasts.find((c) => c.id === castSeedId)

  const filterEffects = (effects: string[]) =>
    effects.map((e) => e.trim()).filter(Boolean).slice(0, 4)

  useEffect(() => {
    if (!isEdit || !editItem || prefilledId === editItem.id) return

    const det = editItem.details as Record<string, unknown> | null
    setType(editItem.type)
    setName(editItem.name ?? '')
    setDescription(editItem.description ?? '')
    setGameRef(
      editItem.gameIcon
        ? {
            category: editItem.gameIcon.category,
            gameIndex: editItem.gameIcon.gameIndex,
            gameCode: editItem.gameIcon.gameCode,
            name: editItem.name ?? editItem.gameIcon.gameCode,
            iconId: editItem.gameIcon.iconId,
            spriteSheet: editItem.gameIcon.spriteSheet,
            spriteCols: editItem.gameIcon.spriteCols,
            itemGrade: 0,
            levelRequired: 0,
          }
        : null,
    )

    if (editItem.type === 'WEAPON' && det) {
      setWeaponRarity(editItem.rarity ?? '')
      setWeaponLevel(Number(det.level) || 1)
      setWeaponSubtype(String(det.subtype ?? ''))
      setAttackMin(Number(det.attackMin) || 0)
      setAttackMax(Number(det.attackMax) || 0)
      setForceAttackMin(Number(det.forceAttackMin) || 0)
      setForceAttackMax(Number(det.forceAttackMax) || 0)
      setWeaponEffects((det.specialEffects as string[]) ?? [])
      const cast = weaponCasts.find((c) => c.name === det.castName)
      setCastSeedId(cast?.id ?? 0)
    } else if (editItem.type === 'ARMOR' && det) {
      setArmorRarity(editItem.rarity ?? '')
      setArmorLevel(Number(det.level) || 1)
      setArmorSubtype(String(det.subtype ?? ''))
      setArmorClass(String(det.armorClass ?? ''))
      setAvgDefPower(Number(det.avgDefPower) || 0)
      setDefenseSuccessRate(Number(det.defenseSuccessRate) || 0)
      setArmorEffects((det.specialEffects as string[]) ?? [])
    } else if (editItem.type === 'ACCESSORY' && det) {
      setRaceId(Number(det.raceId) || 0)
      setAccessorySubtype(String(det.subtype ?? ''))
      setAccessoryEffects((det.specialEffects as string[]) ?? [])
    }

    const weaponSlotState: WeaponSlot[] = Array(TALIC_SLOT_COUNT).fill(null)
    const armorSlotState: ArmorSlot[] = Array(TALIC_SLOT_COUNT).fill(null)
    for (const t of editItem.talics) {
      const slot = t.slot
      if (slot < 0 || slot >= TALIC_SLOT_COUNT) continue
      if (editItem.type === 'WEAPON') {
        weaponSlotState[slot] = { type: t.talicType as WeaponTalicType }
      } else if (editItem.type === 'ARMOR') {
        armorSlotState[slot] = { type: t.talicType as ArmorTalicType }
      }
    }
    setWeaponSlots(weaponSlotState)
    setArmorSlots(armorSlotState)
    setPrefilledId(editItem.id)
  }, [isEdit, editItem, prefilledId, weaponCasts])

  const resetForm = () => {
    setName('')
    setDescription('')
    setImageFile(null)
    setImagePreview(null)
    setGameRef(null)
    setCastSeedId(0)
    setWeaponEffects([])
    setArmorEffects([])
    setAccessoryEffects([])
    setWeaponSlots(Array(TALIC_SLOT_COUNT).fill(null))
    setArmorSlots(Array(TALIC_SLOT_COUNT).fill(null))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setUploadError(null)

    if (!imageFile && !gameRef && !(isEdit && editItem?.imageUrl)) {
      setUploadError('Selecione uma imagem ou um item do servidor (Lua).')
      return
    }

    let imageUrl: string | undefined
    if (imageFile) {
      try {
        imageUrl = await uploadImage.mutateAsync(imageFile)
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Falha no upload da imagem.')
        return
      }
    } else if (isEdit && editItem?.imageUrl) {
      imageUrl = editItem.imageUrl
    }

    const payload: CreateItemPayload = {
      type,
      name: name.trim(),
      gameCode: gameRef?.gameCode,
      imageUrl,
      description: description.trim() || undefined,
      talics: type === 'WEAPON'
        ? weaponSlotsToTalics(weaponSlots)
        : type === 'ARMOR'
          ? armorSlotsToTalics(armorSlots)
          : undefined,
      rarity: '',
    }

    if (type === 'WEAPON') {
      payload.rarity = weaponRarity
      payload.weapon = {
        level: weaponLevel,
        subtype: weaponSubtype,
        attackMin,
        attackMax,
        forceAttackMin,
        forceAttackMax,
        castName: selectedCast?.name,
        specialEffects: filterEffects(weaponEffects),
      }
    } else if (type === 'ARMOR') {
      payload.rarity = armorRarity
      payload.armor = {
        level: armorLevel,
        subtype: armorSubtype,
        armorClass,
        avgDefPower,
        defenseSuccessRate,
        specialEffects: filterEffects(armorEffects),
      }
    } else if (type === 'ACCESSORY') {
      payload.accessory = {
        raceId,
        subtype: accessorySubtypeValue(accessorySubtype),
        specialEffects: filterEffects(accessoryEffects),
      }
    } else {
      payload.name = name.trim() || undefined
    }

    if (isEdit && itemId) {
      await updateItem.mutateAsync({ id: itemId, body: payload as Record<string, unknown> })
      showToast('Item atualizado com sucesso!', 'success')
    } else {
      await createItem.mutateAsync(payload as Record<string, unknown>)
      showToast('Item criado com sucesso!', 'success')
      resetForm()
      setFormKey((k) => k + 1)
    }
    onSuccess?.()
  }

  const keenCount = weaponSlots.filter(s => s?.type === 'KEEN').length
  const keenPct = TALIC_BONUS_PCT[keenCount]

  const favorCount = armorSlots.filter(s => s?.type === 'FAVOR').length
  const favorPct = TALIC_BONUS_PCT[favorCount]

  const isSubmitting =
    createItem.isPending || updateItem.isPending || uploadImage.isPending

  return (
    <Panel title={isEdit ? 'Editar item' : 'Criar item'} variant="amber" code={isEdit ? 'EDIT' : 'NEW'}>
    <form key={formKey} className="create-item-form" onSubmit={handleSubmit}>

      <div className="create-item-form__grid">
        <label>
          Tipo
          <select value={type} onChange={(e) => setType(e.target.value as ItemType)}>
            <option value="WEAPON">Weapon</option>
            <option value="ARMOR">Armor</option>
            <option value="ACCESSORY">Accessory</option>
            <option value="MISC">Misc</option>
          </select>
        </label>

        <label>
          Nome{type !== 'MISC' && ' *'}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome do item"
            required={type !== 'MISC'}
          />
        </label>

        <label className="create-item-form__full">
          Descrição
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descrição opcional"
            rows={2}
          />
        </label>

        <div className="create-item-form__full">
          <span className="create-item-form__image-label">Referência do servidor (ícone Lua)</span>
          <GameRefPicker itemType={type} value={gameRef} onChange={setGameRef} />
        </div>

        <div className="create-item-form__full create-item-form__image-wrap">
          <span className="create-item-form__image-label">
            Imagem {gameRef ? '(opcional)' : '*'}
          </span>
          <ImageUploader
            preview={imagePreview}
            error={uploadError}
            onChange={(file) => {
              setUploadError(null)
              setImageFile(file)
              setImagePreview(URL.createObjectURL(file))
            }}
            onRemove={() => {
              setImageFile(null)
              setImagePreview(null)
            }}
          />
        </div>
      </div>

      {type === 'WEAPON' && (
        <>
          <fieldset className="create-item-form__fieldset">
            <legend>Weapon</legend>
            <div className="create-item-form__grid">
              <label>
                Raridade *
                <select value={weaponRarity} onChange={(e) => setWeaponRarity(e.target.value)} required>
                  <option value="">Selecione...</option>
                  {weaponRarities.map((r) => (
                    <option key={r.id} value={r.name}>{r.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Level *
                <input
                  type="number"
                  min={0}
                  value={weaponLevel}
                  onChange={(e) => setWeaponLevel(Number(e.target.value))}
                  required
                />
              </label>
              <label>
                Subtype *
                <select value={weaponSubtype} onChange={(e) => setWeaponSubtype(e.target.value)} required>
                  <option value="">Selecione...</option>
                  {weaponSubtypes.map((s) => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Attack mín.
                <InputWithBoost value={attackMin} onChange={setAttackMin} pct={keenPct} />
              </label>
              <label>
                Attack máx.
                <InputWithBoost value={attackMax} onChange={setAttackMax} pct={keenPct} />
              </label>
              <label>
                Force attack mín.
                <InputWithBoost value={forceAttackMin} onChange={setForceAttackMin} pct={keenPct} />
              </label>
              <label>
                Force attack máx.
                <InputWithBoost value={forceAttackMax} onChange={setForceAttackMax} pct={keenPct} />
              </label>
              <CastPicker
                label="Cast (opcional)"
                options={weaponCasts}
                value={castSeedId}
                onChange={setCastSeedId}
              />
            </div>
          </fieldset>

          <fieldset className="create-item-form__fieldset">
            <WeaponTalicSlots slots={weaponSlots} onChange={setWeaponSlots} />
          </fieldset>

          <SpecialEffectsField effects={weaponEffects} onChange={setWeaponEffects} />
        </>
      )}

      {type === 'ARMOR' && (
        <>
          <fieldset className="create-item-form__fieldset">
            <legend>Armor</legend>
            <div className="create-item-form__grid">
              <label>
                Raridade *
                <select value={armorRarity} onChange={(e) => setArmorRarity(e.target.value)} required>
                  <option value="">Selecione...</option>
                  {armorRarities.map((r) => (
                    <option key={r.id} value={r.name}>{r.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Level *
                <input
                  type="number"
                  min={0}
                  value={armorLevel}
                  onChange={(e) => setArmorLevel(Number(e.target.value))}
                  required
                />
              </label>
              <label>
                Subtype *
                <select
                  value={armorSubtype}
                  onChange={(e) => {
                    setArmorSubtype(e.target.value)
                    setArmorSlots(Array(TALIC_SLOT_COUNT).fill(null))
                  }}
                  required
                >
                  <option value="">Selecione...</option>
                  {armorSubtypes.map((s) => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Classe *
                <select value={armorClass} onChange={(e) => setArmorClass(e.target.value)} required>
                  <option value="">Selecione...</option>
                  {armorClasses.map((c) => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </label>
              <label>
                AvgDefPower *
                <InputWithBoost value={avgDefPower} onChange={setAvgDefPower} pct={favorPct} required />
              </label>
              <label>
                Defense Success Rate *
                <input
                  type="number"
                  min={0}
                  value={defenseSuccessRate}
                  onChange={(e) => setDefenseSuccessRate(Number(e.target.value))}
                  required
                />
              </label>
            </div>
          </fieldset>

          <fieldset className="create-item-form__fieldset">
            <ArmorTalicSlots
              slots={armorSlots}
              armorSubtype={armorSubtype}
              onChange={setArmorSlots}
            />
          </fieldset>

          <SpecialEffectsField effects={armorEffects} onChange={setArmorEffects} />
        </>
      )}

      {type === 'ACCESSORY' && (
        <>
          <fieldset className="create-item-form__fieldset">
            <legend>Accessory</legend>
            <div className="create-item-form__grid">
              <label>
                Raça *
                <select value={raceId} onChange={(e) => setRaceId(Number(e.target.value))} required>
                  <option value={0}>Selecione...</option>
                  {races.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Subtype *
                <select value={accessorySubtype} onChange={(e) => setAccessorySubtype(e.target.value)} required>
                  <option value="">Selecione...</option>
                  {accessorySubtypes.map((s) => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>
          <SpecialEffectsField effects={accessoryEffects} onChange={setAccessoryEffects} />
        </>
      )}

      <div className="create-item-form__actions">
        {isEdit && onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
            Voltar
          </Button>
        )}
        <Button type="submit" loading={isSubmitting}>
          {isEdit ? 'Salvar alterações' : 'Criar item'}
        </Button>
      </div>
    </form>
    </Panel>
  )
}
