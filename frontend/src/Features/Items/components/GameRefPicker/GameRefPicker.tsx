import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import {
  LUA_ITEM_PAGE_SIZE,
  useLuaItemCatalog,
} from '@/Domain/Catalog/hooks/useLuaItemCatalog'
import type { GameLuaItem, ItemType, LuaItemCategory } from '@/Domain/types/models'
import { SpriteIcon } from '@/Shared/ui/components/SpriteIcon/SpriteIcon'

import '../AccessoryCatalog/AccessoryCatalog.styles.scss'
import './GameRefPicker.styles.scss'

const CATEGORIES_BY_TYPE: Record<ItemType, LuaItemCategory[]> = {
  WEAPON: ['WEAPON'],
  ARMOR: ['HELMET', 'UPPER', 'LOWER', 'GLOVES', 'SHOES', 'SHIELD'],
  ACCESSORY: ['AMULET', 'RING'],
  MISC: ['BOOTY', 'BOX', 'POTION', 'RESOURCE'],
}

const CATEGORY_LABELS: Record<LuaItemCategory, string> = {
  WEAPON: 'Weapon',
  HELMET: 'Helmet',
  UPPER: 'Upper',
  LOWER: 'Lower',
  GLOVES: 'Gloves',
  SHOES: 'Shoes',
  AMULET: 'Amulet',
  RING: 'Ring',
  SHIELD: 'Shield',
  BOOTY: 'Booty',
  BOX: 'Box',
  POTION: 'Potion',
  RESOURCE: 'Resource',
}

interface GameRefPickerProps {
  itemType: ItemType
  value: GameLuaItem | null
  onChange: (item: GameLuaItem | null) => void
}

export function GameRefPicker({ itemType, value, onChange }: GameRefPickerProps) {
  const categories = CATEGORIES_BY_TYPE[itemType]
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<LuaItemCategory>(categories[0])
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(0)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    setCategory(categories[0])
    setPage(0)
    setSearch('')
  }, [itemType, categories])

  useEffect(() => {
    setPage(0)
  }, [category, debouncedSearch])

  const { data, isLoading } = useLuaItemCatalog(
    category,
    { search: debouncedSearch || undefined, page, size: LUA_ITEM_PAGE_SIZE },
    open,
  )

  const items = data?.content ?? []
  const totalPages = data?.totalPages ?? 0

  const handlePick = (item: GameLuaItem) => {
    onChange(item)
    setOpen(false)
  }

  return (
    <div className="game-ref-picker">
      <div className="game-ref-picker__current">
        {value ? (
          <>
            <SpriteIcon
              iconId={value.iconId}
              spriteSheet={value.spriteSheet}
              spriteCols={value.spriteCols}
              size={36}
            />
            <div className="game-ref-picker__meta">
              <span className="game-ref-picker__name">{value.name}</span>
              <span className="game-ref-picker__code">{value.gameCode}</span>
            </div>
            <button type="button" className="game-ref-picker__clear" onClick={() => onChange(null)}>
              Limpar
            </button>
          </>
        ) : (
          <span className="game-ref-picker__empty">Nenhum item do servidor selecionado</span>
        )}
      </div>
      <button type="button" className="game-ref-picker__open" onClick={() => setOpen(true)}>
        Buscar no catálogo Lua
      </button>

      {open &&
        createPortal(
          <div className="game-ref-picker-modal" role="presentation" onClick={() => setOpen(false)}>
            <div
              className="game-ref-picker-modal__card"
              role="dialog"
              aria-modal="true"
              aria-label="Selecionar item do servidor"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="game-ref-picker-modal__header">
                <h4>Item do servidor (Lua)</h4>
                <button type="button" onClick={() => setOpen(false)} aria-label="Fechar">×</button>
              </div>

              <div className="accessory-catalog__mode-tabs accessory-catalog__mode-tabs--wrap">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className={`accessory-catalog__mode-btn${category === cat ? ' accessory-catalog__mode-btn--active' : ''}`}
                    onClick={() => setCategory(cat)}
                  >
                    {CATEGORY_LABELS[cat]}
                  </button>
                ))}
              </div>

              <input
                type="search"
                className="accessory-catalog__search"
                placeholder="Buscar por nome ou código..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              {isLoading && !data ? (
                <p className="accessory-catalog__status">Carregando...</p>
              ) : items.length === 0 ? (
                <p className="accessory-catalog__status">Nenhum item encontrado.</p>
              ) : (
                <div className="game-ref-picker-modal__grid">
                  {items.map((item) => (
                    <button
                      key={item.gameCode}
                      type="button"
                      className={`game-ref-picker-modal__option${value?.gameCode === item.gameCode ? ' game-ref-picker-modal__option--selected' : ''}`}
                      onClick={() => handlePick(item)}
                    >
                      <SpriteIcon
                        iconId={item.iconId}
                        spriteSheet={item.spriteSheet}
                        spriteCols={item.spriteCols}
                        size={32}
                      />
                      <span className="game-ref-picker-modal__name">{item.name}</span>
                      <span className="game-ref-picker-modal__code">{item.gameCode}</span>
                    </button>
                  ))}
                </div>
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
                  <span className="accessory-catalog__page-info">Página {page + 1} de {totalPages}</span>
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
