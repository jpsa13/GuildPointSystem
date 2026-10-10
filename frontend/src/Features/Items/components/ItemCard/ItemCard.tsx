import { useState } from 'react'
import {
  applyBonus,
  expandTalicsForDisplay,
  getFavorPct,
  getKeenPct,
} from '@/Domain/Item/utils/talicUtils'
import { mediaUrl } from '@/Shared/utils/mediaUrl'
import { SpriteIcon } from '@/Shared/ui/components/SpriteIcon/SpriteIcon'
import type { Item, ItemTalic, SeedOption } from '@/Domain/types/models'

export const TALIC_IMAGES: Record<string, string> = {
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

const RARITY_COLOR: Record<string, string> = {
  Normal:   '#FFFFFF',
  Intense:  '#fcff77',
  Purple:   '#C3B1D9',
  Orange:   '#ffa939',
  Superior: '#ffa939',
  Hero:     '#61ff39',
  PVP:      '#B62A09',
  Event:    '#B62A09',
  Leon:     '#61ff39',
  Relic:    '#224abe',
}

export function rarityColor(rarity: string): string {
  return RARITY_COLOR[rarity] ?? '#cfd8e3'
}

function d<T>(details: Record<string, unknown> | null, key: string): T | undefined {
  return details?.[key] as T | undefined
}

function StatRow({ label, value, valueColor }: { label: string; value: React.ReactNode; valueColor?: string }) {
  return (
    <div className="item-tooltip__row">
      <span className="item-tooltip__label">{label}</span>
      <span className="item-tooltip__value" style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </span>
    </div>
  )
}

function StatValueWithBoost({ value, pct }: { value: number; pct: number }) {
  const boosted = pct > 0 && value > 0 ? applyBonus(value, pct) : null
  return (
    <>
      {value}
      {boosted !== null && (
        <span className="item-tooltip__boost"> ({boosted})</span>
      )}
    </>
  )
}

function TalicUpgradeRow({ talics }: { talics: ItemTalic[] }) {
  const expanded = expandTalicsForDisplay(talics)
  if (expanded.length === 0) return null
  return (
    <div className="item-tooltip__row">
      <span className="item-tooltip__label">Upgrade</span>
      <span className="item-tooltip__value item-tooltip__talics">
        {expanded.map((t, i) => {
          const img = TALIC_IMAGES[t.talicType]
          if (!img) return null
          return (
            <img
              key={`${t.talicType}-${t.slot}-${i}`}
              src={img}
              alt={t.talicType}
              className="item-tooltip__talic"
              title={t.talicType}
            />
          )
        })}
      </span>
    </div>
  )
}

export function ItemCard({
  item,
  canAdmin,
  onDelete,
  onEdit,
  weaponCasts,
}: {
  item: Item
  canAdmin: boolean
  onDelete: (id: number) => void
  onEdit?: (id: number) => void
  weaponCasts: SeedOption[]
}) {
  const [imgError, setImgError] = useState(false)
  const det = item.details as Record<string, unknown> | null
  const color = rarityColor(item.rarity)

  const level       = d<number>(det, 'level')
  const subtype     = d<string>(det, 'subtype')
  const attackMin   = d<number>(det, 'attackMin')
  const attackMax   = d<number>(det, 'attackMax')
  const forceMin    = d<number>(det, 'forceAttackMin')
  const forceMax    = d<number>(det, 'forceAttackMax')
  const avgDef      = d<number>(det, 'avgDefPower')
  const defRate     = d<number>(det, 'defenseSuccessRate')
  const castName    = d<string>(det, 'castName')
  const castImage   = weaponCasts.find((c) => c.name === castName)?.imageUrl
  const effects     = d<string[]>(det, 'specialEffects') ?? []
  const keenPct     = item.type === 'WEAPON' ? getKeenPct(item.talics) : 0
  const favorPct    = item.type === 'ARMOR' ? getFavorPct(item.talics) : 0

  return (
    <div className="item-tooltip" style={{ '--rarity': color } as React.CSSProperties}>
      <div className="item-tooltip__header">
        <div className="item-tooltip__icon-wrap">
          {item.gameIcon ? (
            <SpriteIcon
              iconId={item.gameIcon.iconId}
              spriteSheet={item.gameIcon.spriteSheet}
              spriteCols={item.gameIcon.spriteCols}
              size={48}
              className="item-tooltip__icon"
            />
          ) : !imgError && item.imageUrl ? (
            <img
              src={mediaUrl(item.imageUrl)}
              alt={item.name}
              className="item-tooltip__icon"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="item-tooltip__icon-fallback">{item.type[0]}</div>
          )}
        </div>
        <div className="item-tooltip__title-wrap">
          <span className="item-tooltip__name" style={{ color }}>{item.name}</span>
          <span className="item-tooltip__rarity">{item.rarity}</span>
        </div>
        {canAdmin && (
          <div className="item-tooltip__admin-actions">
            {onEdit && (
              <button
                type="button"
                className="item-tooltip__edit"
                title="Editar"
                onClick={() => onEdit(item.id)}
              >
                ✎
              </button>
            )}
            <button
              type="button"
              className="item-tooltip__delete"
              title="Deletar"
              onClick={() => onDelete(item.id)}
            >
              ×
            </button>
          </div>
        )}
      </div>

      <div className="item-tooltip__divider" />

      <div className="item-tooltip__body">
        {subtype  && <StatRow label="Type"  value={subtype} />}
        {level    && <StatRow label="Level" value={level} />}

        {item.type === 'WEAPON' && attackMin !== undefined && attackMax !== undefined && (
          <div className="item-tooltip__row">
            <span className="item-tooltip__label">Attack</span>
            <span className="item-tooltip__value">
              <StatValueWithBoost value={attackMin} pct={keenPct} />
              {' – '}
              <StatValueWithBoost value={attackMax} pct={keenPct} />
            </span>
          </div>
        )}

        {item.type === 'WEAPON' && forceMin !== undefined && (
          <div className="item-tooltip__row">
            <span className="item-tooltip__label">Force Attack</span>
            <span className="item-tooltip__value">
              <StatValueWithBoost value={forceMin} pct={keenPct} />
              {' – '}
              <StatValueWithBoost value={forceMax ?? 0} pct={keenPct} />
            </span>
          </div>
        )}

        {item.type === 'ARMOR' && avgDef !== undefined && (
          <div className="item-tooltip__row">
            <span className="item-tooltip__label">Avg Def Power</span>
            <span className="item-tooltip__value">
              <StatValueWithBoost value={avgDef} pct={favorPct} />
            </span>
          </div>
        )}
        {item.type === 'ARMOR' && defRate !== undefined && (
          <StatRow label="Def Success" value={`${defRate}%`} />
        )}

        {castName && (
          <div className="item-tooltip__row">
            <span className="item-tooltip__label">Cast</span>
            <span className="item-tooltip__value item-tooltip__cast">
              {castImage && (
                <img src={castImage} alt="" className="item-tooltip__cast-icon" />
              )}
              <span style={{ color }}>{castName}</span>
            </span>
          </div>
        )}

        {effects.length > 0 && (
          <div className="item-tooltip__row item-tooltip__row--effects">
            <span className="item-tooltip__label">Special Effects</span>
            <span className="item-tooltip__value item-tooltip__effects">
              {effects.map((effect, i) => (
                <span key={i} className="item-tooltip__effect">{effect}</span>
              ))}
            </span>
          </div>
        )}

        <TalicUpgradeRow talics={item.talics} />

        {item.description && (
          <>
            <div className="item-tooltip__divider" />
            <p className="item-tooltip__desc">{item.description}</p>
          </>
        )}
      </div>
    </div>
  )
}
