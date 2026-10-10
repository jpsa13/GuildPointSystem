import { useEffect, useState } from 'react'

import {
  LUA_ITEM_PAGE_SIZE,
  useLuaItemCatalog,
} from '@/Domain/Catalog/hooks/useLuaItemCatalog'
import type { LuaItemCategory } from '@/Domain/types/models'
import { SpriteIcon } from '@/Shared/ui/components/SpriteIcon/SpriteIcon'

import '../AccessoryCatalog/AccessoryCatalog.styles.scss'

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

const FILTERED_NOTE =
  'Equipamentos e acessórios: Exist/Exists = true e nível ≤ 55. Demais categorias: todos os itens do servidor.'

export function ServerItemCatalog() {
  const [category, setCategory] = useState<LuaItemCategory>('WEAPON')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(0)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    setPage(0)
  }, [category, debouncedSearch])

  const filters = {
    search: debouncedSearch || undefined,
    page,
    size: LUA_ITEM_PAGE_SIZE,
  }

  const { data, isLoading, isFetching } = useLuaItemCatalog(category, filters, true)

  const items = data?.content ?? []
  const totalPages = data?.totalPages ?? 0
  const totalElements = data?.totalElements ?? 0

  return (
    <div className="accessory-catalog">
      <p className="accessory-catalog__status accessory-catalog__hint">{FILTERED_NOTE}</p>

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
        />
      </div>

      {isLoading && !data ? (
        <p className="accessory-catalog__status">Carregando {category}...</p>
      ) : items.length === 0 ? (
        <p className="accessory-catalog__status">Nenhum item encontrado.</p>
      ) : (
        <>
          <div className="accessory-catalog__grid">
            {items.map((item) => (
              <article key={item.gameCode} className="accessory-card accessory-card--static">
                <div className="accessory-card__header">
                  <div className="accessory-card__icon">
                    <SpriteIcon
                      iconId={item.iconId}
                      spriteSheet={item.spriteSheet}
                      spriteCols={item.spriteCols}
                      size={36}
                    />
                  </div>
                  <div className="accessory-card__title-group">
                    <span className="accessory-card__name">{item.name}</span>
                    <div className="accessory-card__tags">
                      <span className="accessory-card__tag">{item.gameCode}</span>
                      <span className="accessory-card__tag">Idx {item.gameIndex}</span>
                      {item.levelRequired > 0 && (
                        <span className="accessory-card__tag">Lv {item.levelRequired}</span>
                      )}
                      {item.itemGrade > 0 && (
                        <span className="accessory-card__tag">G{item.itemGrade}</span>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="accessory-catalog__pagination">
              <button
                type="button"
                className="accessory-catalog__page-btn"
                disabled={page === 0 || isFetching}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Anterior
              </button>
              <span className="accessory-catalog__page-info">
                Página {page + 1} de {totalPages}
                <span className="accessory-catalog__page-count">({totalElements} itens)</span>
              </span>
              <button
                type="button"
                className="accessory-catalog__page-btn"
                disabled={page >= totalPages - 1 || isFetching}
                onClick={() => setPage((p) => p + 1)}
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
