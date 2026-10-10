import { useEffect, useState } from 'react'

import {
  GUILD_INVENTORY_PAGE_SIZE,
  useGuildInventory,
} from '@/Domain/Item/hooks/useGuildInventory'
import type { LuaItemCategory, SeedOption } from '@/Domain/types/models'
import { ItemCard } from '@/Features/Items/components/ItemCard/ItemCard'

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

interface GuildInventoryListProps {
  canAdmin: boolean
  weaponCasts: SeedOption[]
  onEdit?: (id: number) => void
  onDelete: (id: number) => void
}

export function GuildInventoryList({
  canAdmin,
  weaponCasts,
  onEdit,
  onDelete,
}: GuildInventoryListProps) {
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

  const { data, isLoading, isError, error, isFetching } = useGuildInventory({
    category,
    search: debouncedSearch || undefined,
    page,
    size: GUILD_INVENTORY_PAGE_SIZE,
  })

  const items = data?.content ?? []
  const totalPages = data?.totalPages ?? 0
  const totalElements = data?.totalElements ?? 0

  return (
    <div className="accessory-catalog">
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
        <span className="accessory-catalog__status">
          {isFetching ? 'Atualizando…' : `${totalElements.toLocaleString('pt-BR')} itens`}
        </span>
      </div>

      {isLoading ? (
        <p className="items-page__loading">Carregando itens...</p>
      ) : isError ? (
        <p className="items-page__empty">
          Erro ao carregar itens: {error instanceof Error ? error.message : 'tente novamente.'}
        </p>
      ) : items.length === 0 ? (
        <p className="items-page__empty">Nenhum item nesta categoria.</p>
      ) : (
        <>
          <div className="items-grid">
            {items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                canAdmin={canAdmin}
                weaponCasts={weaponCasts}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="accessory-catalog__pagination">
              <button
                type="button"
                className="accessory-catalog__page-btn"
                disabled={page <= 0}
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
        </>
      )}
    </div>
  )
}
