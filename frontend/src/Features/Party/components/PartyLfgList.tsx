import type { ReactNode } from 'react'
import type { PartyLfgEntry } from '@/Features/Party/Party.types'
import { formatWaiting, sortByWaiting } from '@/Features/Party/utils/partyWait'
import { setPartyDragData } from '@/Features/Party/utils/partyDrag'
import { MemberClassIcon } from '@/Shared/ui/components/MemberClassIcon/MemberClassIcon'
import { PartyAfkControl } from './PartyAfkControl'
import { useServerNow } from '@/Shared/utils/useServerNow'

// Timers tick here (server clock, once a second) so only the waiting list re-renders, not the page.

export function WaitingTime({ since }: { since: string }) {
  const now = useServerNow()
  return <>{formatWaiting(now - new Date(since).getTime())}</>
}

export function PartyLfgList({
  entries,
  viewerId,
  canDrag,
  actions,
  queueActions,
  canManageAfk = false,
  search = '',
}: {
  entries: PartyLfgEntry[]
  viewerId?: number
  canDrag: boolean
  /** Extra buttons at the end of a card (e.g. admin "remove from the list"). */
  actions?: (entry: PartyLfgEntry) => ReactNode
  queueActions?: (entry: PartyLfgEntry) => ReactNode
  canManageAfk?: boolean
  /** Shows only nicknames containing this text; each card keeps its real place in the queue. */
  search?: string
}) {
  const now = useServerNow()
  const term = search.trim().toLocaleLowerCase('pt-BR')
  const ordered = sortByWaiting(entries)
    .map((entry, index) => ({ entry, place: index + 1 }))
    .filter(({ entry }) => !term || entry.nickname.toLocaleLowerCase('pt-BR').includes(term))

  if (ordered.length === 0) {
    return <p className="party-page__empty party-page__empty--panel">Nenhum membro encontrado.</p>
  }

  return (
    <ol className="party-lfg-grid">
      {ordered.map(({ entry, place }) => {
        const draggable = canDrag && entry.memberId !== viewerId
        const isMe = entry.memberId === viewerId
        return (
          <li
            key={entry.memberId}
            className={[
              'party-lfg-item',
              draggable ? 'party-lfg-item--draggable' : '',
              isMe ? 'party-lfg-item--me' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            draggable={draggable}
            onDragStart={(e) => {
              if (!draggable) return
              setPartyDragData(e, { memberId: entry.memberId, fromPartyId: null, nickname: entry.nickname })
            }}
          >
            <div className="party-lfg-item__main">
              <span className="party-lfg-item__rank" title="Posição na fila: mais pontos primeiro, depois a ordem de espera">
                {place}
              </span>
              <span className={`party-lfg-item__points${(entry.priorityPoints ?? 0) > 0 ? ' is-positive' : ''}`}
                title="Prioridade da fila. Zera ao entrar em uma PT.">{entry.priorityPoints ?? 0} pts</span>
              {entry.classImageUrl ? (
                <MemberClassIcon classImageUrl={entry.classImageUrl} classLabel={entry.className ?? ''} size="sm" />
              ) : (
                <span className="party-card__roster-fallback party-card__roster-fallback--muted">?</span>
              )}
              <strong className="party-lfg-item__name" title={entry.nickname}>
                {entry.nickname}
                {isMe ? ' (você)' : ''}
              </strong>
              {entry.lastUnansweredAt && <span className="party-lfg-item__unanswered" role="img"
                aria-label="Chamado, não respondeu"
                title={`Chamado, não respondeu · ${new Date(entry.lastUnansweredAt).toLocaleString('pt-BR')}`} />}
              {actions && (
                <div className="party-lfg-item__actions" draggable={false} onDragStart={(e) => e.stopPropagation()}>
                  {actions(entry)}
                </div>
              )}
            </div>
            {/* Keep the original wait clock separate from queue priority and actions. */}
            <div className="party-lfg-item__meta">
              <span className="party-lfg-item__level" title={`Lv ${entry.level}${entry.expPercent != null ? ` · ${entry.expPercent.toFixed(2)}% XP` : ''}`}>
                Lv {entry.level}
                {entry.expPercent != null ? ` · ${entry.expPercent.toFixed(2)}%` : ''}
              </span>
              <span
                className="party-lfg-item__wait"
                title={`Na lista desde ${new Date(entry.createdAt).toLocaleTimeString('pt-BR')}`}
              >
                {formatWaiting(now - new Date(entry.createdAt).getTime())}
              </span>
              {queueActions && <div draggable={false} onDragStart={e => e.stopPropagation()}>{queueActions(entry)}</div>}
            </div>
            {entry.afkSince && <PartyAfkControl memberId={entry.memberId} nickname={entry.nickname} queued
              canControl={canManageAfk || entry.memberId === viewerId} />}
          </li>
        )
      })}
    </ol>
  )
}
