import { useEffect, useState } from 'react'
import { useMemberRanking } from '@/Domain/Member/hooks/useMembers'
import { Button } from '@/Shared/ui/components/Button/Button'
import { MemberClassIcon } from '@/Shared/ui/components/MemberClassIcon/MemberClassIcon'
import type { PartyBoard } from '@/Features/Party/Party.types'
import '@/Features/Auth/Auth.styles.scss'
import './PartyLfgAddModal.styles.scss'

interface PartyLfgAddModalProps {
  board: PartyBoard
  /** Member being added right now (shows the spinner on their row). */
  addingId: number | null
  onAdd: (memberId: number) => void
  onClose: () => void
}

/**
 * Admin picker: approved members who are neither in a PT nor on the waiting list. Stays open so
 * several members can be added in a row; each one leaves the list as soon as the board updates.
 */
export function PartyLfgAddModal({ board, addingId, onAdd, onClose }: PartyLfgAddModalProps) {
  const { data: members = [], isLoading } = useMemberRanking()
  const [search, setSearch] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const busy = new Set<number>()
  board.parties.forEach((p) => p.members.forEach((m) => busy.add(m.id)))
  board.lfg.forEach((e) => busy.add(e.memberId))

  const term = search.trim().toLocaleLowerCase('pt-BR')
  const available = members
    .filter((m) => !busy.has(m.id))
    .filter((m) => !term || m.nickname.toLocaleLowerCase('pt-BR').includes(term))
    .sort((a, b) => a.nickname.localeCompare(b.nickname, 'pt-BR'))

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div className="modal-card party-lfg-add" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="auth-window-bar">
          <span>Adicionar à lista de espera</span>
          <span className="auth-window-bar__code">LFP</span>
        </div>
        <div className="auth-card-content party-lfg-add__body">
          <input
            type="search"
            className="party-lfg-add__search"
            placeholder="Buscar membro"
            aria-label="Buscar membro para adicionar"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          {isLoading ? (
            <p className="party-lfg-add__empty">Carregando membros...</p>
          ) : available.length === 0 ? (
            <p className="party-lfg-add__empty">
              {term ? 'Nenhum membro encontrado.' : 'Todos os membros já estão em uma PT ou na lista de espera.'}
            </p>
          ) : (
            <ul className="party-lfg-add__list">
              {available.map((m) => (
                <li key={m.id} className="party-lfg-add__item">
                  {m.classImageUrl && m.className ? (
                    <MemberClassIcon classImageUrl={m.classImageUrl} classLabel={m.className} size="sm" />
                  ) : (
                    <span className="party-card__roster-fallback party-card__roster-fallback--muted">?</span>
                  )}
                  <span className="party-lfg-add__name" title={m.nickname}>
                    {m.nickname}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={addingId === m.id}
                    disabled={addingId != null && addingId !== m.id}
                    onClick={() => onAdd(m.id)}
                  >
                    Adicionar
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="party-lfg-add__actions">
            <Button type="button" variant="secondary" onClick={onClose}>
              Fechar
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
