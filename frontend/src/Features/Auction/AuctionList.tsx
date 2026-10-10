import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuctions, useCreateAuction, useDeleteAuction } from '@/Domain/Auction/hooks/useAuction'
import { isAuctionFinished } from '@/Domain/types/models'
import { useAppToast } from '@/Shared/ui/components/AppToast/AppToast'
import { ConfirmDialog } from '@/Shared/ui/components/ConfirmDialog/ConfirmDialog'
import { useAuthContext } from '@/Features/Auth/contexts/AuthContext'
import { AuctionItemPicker } from '@/Features/Auction/components/AuctionItemPicker/AuctionItemPicker'
import { AuctionItemIcon } from '@/Features/Auction/components/AuctionItemIcon/AuctionItemIcon'
import { Button } from '@/Shared/ui/components/Button/Button'
import { Panel } from '@/Shared/ui/components/Panel/Panel'
import type { Auction } from '@/Domain/types/models'
import './Auction.styles.scss'

const DURATIONS = [
  { value: 1, label: '1 min' },
  { value: 5, label: '5 min' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 h' },
  { value: 180, label: '3 h' },
  { value: 360, label: '6 h' },
  { value: 720, label: '12 h' },
  { value: 1440, label: '24 h' },
] as const

type ItemEntry = { itemId: number; quantity: number }

const emptyEntry = (): ItemEntry => ({ itemId: 0, quantity: 1 })

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Aberto',
  DOLE: 'DOLE',
  TIE_BREAK: 'Empate',
  CLOSED: 'Encerrado',
  CANCELLED: 'Cancelado',
}

function AuctionListSection({
  title,
  auctions,
  emptyText,
  onDelete,
  deletingId,
}: {
  title: string
  auctions: Auction[]
  emptyText?: string
  /** Shown only for finished auctions, to Líder/Administrador. */
  onDelete?: (auction: Auction) => void
  deletingId?: number | null
}) {
  if (auctions.length === 0 && !emptyText) return null

  return (
    <Panel title={title} code={`${auctions.length} LOT`} flush>
      {auctions.length === 0 ? (
        <p className="auction-page__empty">{emptyText}</p>
      ) : (
        <ul className="auction-list">
          {auctions.map((auction) => (
            <li
              key={auction.id}
              className={`auction-list__item${isAuctionFinished(auction.status) ? ' auction-list__item--closed' : ''}`}
            >
              <span className="auction-list__lot">#{String(auction.id).padStart(3, '0')}</span>
              <AuctionItemIcon item={auction.items[0]} />
              <div className="auction-list__info">
                <strong>
                  {auction.items.map((i) => i.itemName).join(', ') || `Leilão #${auction.id}`}
                </strong>
                <small>
                  {[
                    auction.winnerNickname ? `Vencedor: ${auction.winnerNickname}` : '',
                    auction.tiedCount > 1 ? `${auction.tiedCount} empatados` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </small>
              </div>
              <span
                className={`auction-list__status auction-list__status--${auction.status.toLowerCase()}`}
              >
                {STATUS_LABEL[auction.status] ?? auction.status}
              </span>
              <span className="auction-list__bid">{auction.currentBid}</span>
              <div className="auction-list__actions">
                <Link to={`/auctions/${auction.id}`}>
                  <Button variant="secondary" size="sm">
                    Ver
                  </Button>
                </Link>
                {onDelete && isAuctionFinished(auction.status) && (
                  <Button
                    variant="danger"
                    size="sm"
                    loading={deletingId === auction.id}
                    onClick={() => onDelete(auction)}
                  >
                    Excluir
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

export function AuctionListPage() {
  const { data: auctions = [], isLoading } = useAuctions()
  const createAuction = useCreateAuction()
  const deleteAuction = useDeleteAuction()
  const { showToast } = useAppToast()
  const { hasRole } = useAuthContext()
  const isAdmin = hasRole('ADMINISTRADOR')

  const [durationMinutes, setDurationMinutes] = useState(15)
  const [entries, setEntries] = useState<ItemEntry[]>([emptyEntry()])
  const [pendingDelete, setPendingDelete] = useState<Auction | null>(null)
  const closeDelete = useCallback(() => setPendingDelete(null), [])

  const updateEntry = (index: number, patch: Partial<ItemEntry>) => {
    setEntries((prev) => prev.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)))
  }

  const addEntry = () => setEntries((prev) => [...prev, emptyEntry()])

  const removeEntry = (index: number) => {
    setEntries((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)))
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const validItems = entries.filter((entry) => entry.itemId > 0 && entry.quantity >= 1)
    if (validItems.length === 0) return

    await createAuction.mutateAsync({
      durationMinutes,
      items: validItems.map(({ itemId, quantity }) => ({ itemId, quantity })),
    })
    setEntries([emptyEntry()])
  }

  if (isLoading) return <p>Carregando leilões...</p>

  const active = auctions.filter((a) => !isAuctionFinished(a.status))
  const closed = auctions.filter((a) => isAuctionFinished(a.status))

  const lotOf = (auction: Auction) => `#${String(auction.id).padStart(3, '0')}`

  const handleDelete = async () => {
    if (!pendingDelete) return
    try {
      await deleteAuction.mutateAsync(pendingDelete.id)
      showToast(`Leilão ${lotOf(pendingDelete)} excluído.`, 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Não foi possível excluir o leilão.', 'error')
    } finally {
      setPendingDelete(null)
    }
  }

  return (
    <div className="auction-page">
      {isAdmin && (
        <Panel title="Abrir leilão" variant="amber" code="ADM">
          <form className="auction-form" onSubmit={handleCreate}>
            <div className="auction-form__row">
              <label className="auction-form__field">
                <span>Duração</span>
                <select
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                >
                  {DURATIONS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <fieldset className="auction-form__items">
              <legend>Itens do leilão</legend>
              {entries.map((entry, index) => {
                const otherIds = entries
                  .filter((_, i) => i !== index)
                  .map((e) => e.itemId)
                  .filter((id) => id > 0)
                return (
                <div key={index} className="auction-form__item-row">
                  <AuctionItemPicker
                    itemId={entry.itemId}
                    onChange={(id) => updateEntry(index, { itemId: id })}
                    disabledIds={otherIds}
                  />
                  <input
                    type="number"
                    min={1}
                    value={entry.quantity}
                    onChange={(e) => updateEntry(index, { quantity: Number(e.target.value) })}
                    aria-label="Quantidade"
                    required
                  />
                  {entries.length > 1 && (
                    <Button type="button" variant="secondary" size="sm" onClick={() => removeEntry(index)}>
                      Remover
                    </Button>
                  )}
                </div>
                )
              })}
              <Button type="button" variant="secondary" size="sm" onClick={addEntry}>
                + Adicionar item
              </Button>
            </fieldset>

            <Button
              type="submit"
              loading={createAuction.isPending}
              disabled={!entries.some((e) => e.itemId > 0)}
            >
              Criar Leilão
            </Button>
          </form>
        </Panel>
      )}

      <AuctionListSection title="Em andamento" auctions={active} emptyText="Nenhum leilão aberto." />
      <AuctionListSection
        title="Encerrados"
        auctions={closed}
        onDelete={isAdmin ? setPendingDelete : undefined}
        deletingId={deleteAuction.isPending ? deleteAuction.variables : null}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Excluir leilão ${pendingDelete ? lotOf(pendingDelete) : ''}`}
        code="ADM"
        confirmLabel="Excluir leilão"
        loading={deleteAuction.isPending}
        onConfirm={handleDelete}
        onCancel={closeDelete}
      >
        {pendingDelete && (
          <>
            <p>
              <strong>{pendingDelete.items.map((i) => i.itemName).join(', ')}</strong> — o leilão, os
              lances e o chat serão apagados. Essa ação não pode ser desfeita.
            </p>
            <p className="confirm-dialog__note">
              Os pontos não são alterados
              {pendingDelete.winnerNickname
                ? `: ${pendingDelete.winnerNickname} continua debitado em ${pendingDelete.currentBid} pts.`
                : '.'}
            </p>
          </>
        )}
      </ConfirmDialog>
    </div>
  )
}
