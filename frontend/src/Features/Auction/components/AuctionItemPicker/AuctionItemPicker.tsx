import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import {
  GUILD_INVENTORY_PAGE_SIZE,
  useGuildInventory,
} from '@/Domain/Item/hooks/useGuildInventory'
import { useItem } from '@/Domain/Item/hooks/useItems'
import type { Item, LuaItemCategory } from '@/Domain/types/models'
import { rarityColor } from '@/Features/Items/components/ItemCard/ItemCard'
import { mediaUrl } from '@/Shared/utils/mediaUrl'
import { SpriteIcon } from '@/Shared/ui/components/SpriteIcon/SpriteIcon'

import '@/Features/Items/components/AccessoryCatalog/AccessoryCatalog.styles.scss'
import '@/Features/Items/components/GameRefPicker/GameRefPicker.styles.scss'
import './AuctionItemPicker.styles.scss'

const CATEGORIES: { id: LuaItemCategory; label: string }[] = [
  { id: 'WEAPON', label: 'Weapon' },
  { id: 'HELMET', label: 'Helmet' },
  { id: 'UPPER', label: 'Upper' },
  { id: 'LOWER', label: 'Lower' },
  { id: 'GLOVES', label: 'Gloves' },
  { id: 'SHOES', label: 'Shoes' },
  { id: 'AMULET', label: 'Amulet' },
  { id: 'RING', label: 'Ring' },
  { id: 'SHIELD', label: 'Shield' },
  { id: 'BOOTY', label: 'Booty' },
  { id: 'BOX', label: 'Box' },
  { id: 'POTION', label: 'Potion' },
  { id: 'RESOURCE', label: 'Resource' },
]

function detailLines(item: Item): string[] {
  const det = item.details as Record<string, unknown> | null
  if (!det) return []
  const lines: string[] = []
  const subtype = det.subtype as string | undefined
  const level = det.level as number | undefined
  if (subtype) lines.push(subtype)
  if (level != null) lines.push(`Lv ${level}`)
  if (item.type === 'WEAPON') {
    const min = det.attackMin as number | undefined
    const max = det.attackMax as number | undefined
    if (min != null && max != null) lines.push(`Atk ${min}–${max}`)
    const fmin = det.forceAttackMin as number | undefined
    const fmax = det.forceAttackMax as number | undefined
    if (fmin != null && fmax != null && (fmin > 0 || fmax > 0)) {
      lines.push(`Force ${fmin}–${fmax}`)
    }
  }
  if (item.type === 'ARMOR') {
    const def = det.avgDefPower as number | undefined
    if (def != null && def > 0) lines.push(`Def ${def}`)
  }
  const effects = det.specialEffects as string[] | undefined
  if (effects?.length) lines.push(...effects.slice(0, 2))
  return lines
}

function ItemIcon({ item, size = 40 }: { item: Item; size?: number }) {
  if (item.gameIcon) {
    return (
      <SpriteIcon
        iconId={item.gameIcon.iconId}
        spriteSheet={item.gameIcon.spriteSheet}
        spriteCols={item.gameIcon.spriteCols}
        size={size}
        className="auction-item-picker__icon"
      />
    )
  }
  if (item.imageUrl) {
    return (
      <img
        src={mediaUrl(item.imageUrl)}
        alt=""
        className="auction-item-picker__icon auction-item-picker__icon--img"
        width={size}
        height={size}
      />
    )
  }
  return <div className="auction-item-picker__icon-fallback">{item.type[0]}</div>
}

interface AuctionItemPickerProps {
  itemId: number
  onChange: (itemId: number) => void
  disabledIds?: number[]
}

export function AuctionItemPicker({ itemId, onChange, disabledIds = [] }: AuctionItemPickerProps) {
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<LuaItemCategory>('WEAPON')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(0)

  const { data: selectedItem } = useItem(itemId)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    setPage(0)
  }, [category, debouncedSearch])

  useEffect(() => {
    if (!open) return
    setSearch('')
    setDebouncedSearch('')
    setPage(0)
  }, [open])

  const { data, isLoading, isFetching } = useGuildInventory(
    {
      category,
      search: debouncedSearch || undefined,
      page,
      size: GUILD_INVENTORY_PAGE_SIZE,
    },
    open,
  )

  const items = data?.content ?? []
  const totalPages = data?.totalPages ?? 0
  const totalElements = data?.totalElements ?? 0

  const handlePick = (item: Item) => {
    if (disabledIds.includes(item.id)) return
    onChange(item.id)
    setOpen(false)
  }

  return (
    <div className="auction-item-picker game-ref-picker">
      <div className="game-ref-picker__current auction-item-picker__current">
        {selectedItem && itemId > 0 ? (
          <>
            <ItemIcon item={selectedItem} size={44} />
            <div className="game-ref-picker__meta auction-item-picker__meta">
              <span
                className="game-ref-picker__name"
                style={{ color: rarityColor(selectedItem.rarity ?? '') }}
              >
                {selectedItem.name}
              </span>
              <span className="auction-item-picker__details">
                {detailLines(selectedItem).join(' · ') || selectedItem.gameCode || '—'}
              </span>
            </div>
            <button type="button" className="game-ref-picker__clear" onClick={() => onChange(0)}>
              Limpar
            </button>
          </>
        ) : (
          <span className="game-ref-picker__empty">Nenhum item selecionado</span>
        )}
      </div>
      <button type="button" className="game-ref-picker__open" onClick={() => setOpen(true)}>
        Escolher item
      </button>

      {open &&
        createPortal(
          <div
            className="game-ref-picker-modal auction-item-picker-modal"
            role="presentation"
            onClick={() => setOpen(false)}
          >
            <div
              className="game-ref-picker-modal__card auction-item-picker-modal__card"
              role="dialog"
              aria-modal="true"
              aria-label="Selecionar item do inventário"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="game-ref-picker-modal__header">
                <h4>Inventário da guild</h4>
                <button type="button" onClick={() => setOpen(false)} aria-label="Fechar">×</button>
              </div>

              <div className="accessory-catalog__mode-tabs accessory-catalog__mode-tabs--wrap">
                {CATEGORIES.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`accessory-catalog__mode-btn${category === tab.id ? ' accessory-catalog__mode-btn--active' : ''}`}
                    onClick={() => setCategory(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="accessory-catalog__filters">
                <input
                  type="search"
                  className="accessory-catalog__search"
                  placeholder="Buscar por nome ou código..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                />
                <span className="accessory-catalog__status">
                  {isFetching ? 'Buscando…' : `${totalElements.toLocaleString('pt-BR')} itens`}
                </span>
              </div>

              {isLoading && !data ? (
                <p className="accessory-catalog__status">Carregando...</p>
              ) : items.length === 0 ? (
                <p className="accessory-catalog__status">Nenhum item encontrado.</p>
              ) : (
                <ul className="auction-item-picker-modal__list">
                  {items.map((item) => {
                    const taken = disabledIds.includes(item.id)
                    const lines = detailLines(item)
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          className={`auction-item-picker-modal__row${itemId === item.id ? ' auction-item-picker-modal__row--selected' : ''}${taken ? ' auction-item-picker-modal__row--disabled' : ''}`}
                          onClick={() => handlePick(item)}
                          disabled={taken}
                        >
                          <ItemIcon item={item} size={36} />
                          <div className="auction-item-picker-modal__text">
                            <span
                              className="auction-item-picker-modal__name"
                              style={{ color: rarityColor(item.rarity ?? '') }}
                            >
                              {item.name}
                            </span>
                            {lines.length > 0 && (
                              <span className="auction-item-picker-modal__sub">{lines.join(' · ')}</span>
                            )}
                            {item.gameCode && (
                              <span className="auction-item-picker-modal__code">{item.gameCode}</span>
                            )}
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}

              {totalPages > 1 && (
                <div className="accessory-catalog__pagination">
                  <button
                    type="button"
                    className="accessory-catalog__page-btn"
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    Anterior
                  </button>
                  <span className="accessory-catalog__page-info">
                    Página {page + 1} / {totalPages}
                  </span>
                  <button
                    type="button"
                    className="accessory-catalog__page-btn"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Próxima
                  </button>
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
