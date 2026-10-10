import { useState } from 'react'
import { useDeleteItem } from '@/Domain/Item/hooks/useItems'
import { useGuildInventory } from '@/Domain/Item/hooks/useGuildInventory'
import { useItemSeeds } from '@/Domain/Seed/hooks/useItemSeeds'
import { useAuthContext } from '@/Features/Auth/contexts/AuthContext'
import { useAppToast } from '@/Shared/ui/components/AppToast/AppToast'
import { Button } from '@/Shared/ui/components/Button/Button'
import { Panel } from '@/Shared/ui/components/Panel/Panel'
import { CreateItemForm } from '@/Features/Items/components/CreateItemForm/CreateItemForm'
import { GuildInventoryList } from '@/Features/Items/components/GuildInventoryList/GuildInventoryList'
import './Items.styles.scss'

export { ItemCard } from '@/Features/Items/components/ItemCard/ItemCard'

type Tab = 'list' | 'create' | 'edit'

export function ItemsPage() {
  const { data: inventorySummary } = useGuildInventory({ page: 0, size: 1 })
  const totalInventory = inventorySummary?.totalElements ?? 0
  const { data: weaponCasts = [] } = useItemSeeds('WEAPON_CAST')
  const { hasRole } = useAuthContext()
  const { showToast } = useAppToast()
  const deleteItem = useDeleteItem()
  const isAdmin = hasRole('ADMINISTRADOR')

  const [tab, setTab] = useState<Tab>('list')
  const [editItemId, setEditItemId] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)

  const handleDelete = async (id: number) => {
    try {
      await deleteItem.mutateAsync(id)
      showToast('Item deletado.', 'success')
      setConfirmDelete(null)
    } catch {
      showToast('Erro ao deletar item.', 'error')
    }
  }

  return (
    <div className="items-page">
      <div className="items-tabs" role="tablist">
        <button
          type="button"
          className={`items-tabs__btn${tab === 'list' || tab === 'edit' ? ' items-tabs__btn--active' : ''}`}
          onClick={() => {
            setEditItemId(null)
            setTab('list')
          }}
        >
          Listagem
        </button>
        {isAdmin && (
          <button
            type="button"
            className={`items-tabs__btn${tab === 'create' ? ' items-tabs__btn--active' : ''}`}
            onClick={() => setTab('create')}
          >
            + Criar item
          </button>
        )}
      </div>

      {tab === 'create' && isAdmin && (
        <CreateItemForm onSuccess={() => setTab('list')} />
      )}

      {tab === 'edit' && isAdmin && editItemId != null && (
        <CreateItemForm
          itemId={editItemId}
          onCancel={() => {
            setEditItemId(null)
            setTab('list')
          }}
          onSuccess={() => {
            setEditItemId(null)
            setTab('list')
          }}
        />
      )}

      {tab === 'list' && (
        <Panel title="Inventário da guild" code={`${totalInventory.toLocaleString('pt-BR')} ITM`}>
          <GuildInventoryList
            canAdmin={isAdmin}
            weaponCasts={weaponCasts}
            onEdit={
              isAdmin
                ? (id) => {
                    setEditItemId(id)
                    setTab('edit')
                  }
                : undefined
            }
            onDelete={(id) => setConfirmDelete(id)}
          />
        </Panel>
      )}

      {confirmDelete !== null && (
        <div className="items-confirm-overlay" onClick={() => setConfirmDelete(null)}>
          <div onClick={(e) => e.stopPropagation()}>
            <Panel title="Excluir item" variant="danger" className="items-confirm">
              <p>Confirmar exclusão do item?</p>
              <div className="items-confirm__actions">
                <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(null)}>
                  Cancelar
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => handleDelete(confirmDelete)}
                  disabled={deleteItem.isPending}
                >
                  {deleteItem.isPending ? 'Deletando...' : 'Deletar'}
                </Button>
              </div>
            </Panel>
          </div>
        </div>
      )}
    </div>
  )
}
