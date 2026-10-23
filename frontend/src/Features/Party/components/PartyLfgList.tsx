import type { ReactNode } from 'react'
import type { PartyLfgEntry } from '@/Features/Party/Party.types'
import { formatWaiting, sortByWaiting } from '@/Features/Party/utils/partyWait'
import { setPartyDragData } from '@/Features/Party/utils/partyDrag'
import { MemberClassIcon } from '@/Shared/ui/components/MemberClassIcon/MemberClassIcon'
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
}: {
  entries: PartyLfgEntry[]
  viewerId?: number
  canDrag: boolean
  /** Extra buttons at the end of a card (e.g. admin "remove from the list"). */
  actions?: (entry: PartyLfgEntry) => ReactNode
}) {
  const now = useServerNow()
  const ordered = sortByWaiting(entries)

  return (
    <ol className="party-lfg-grid">
      {ordered.map((entry, index) => {
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
              <span className="party-lfg-item__rank" title="Posição na fila (maior tempo de espera primeiro)">
                {index + 1}
              </span>
              {entry.classImageUrl ? (
                <MemberClassIcon classImageUrl={entry.classImageUrl} classLabel={entry.className ?? ''} size="sm" />
              ) : (
                <span className="party-card__roster-fallback party-card__roster-fallback--muted">?</span>
              )}
              <div className="party-lfg-item__info">
                <strong title={entry.nickname}>
                  {entry.nickname}
                  {isMe ? ' (você)' : ''}
                </strong>
                {/* Only the class name is cut when narrow; the level always shows. */}
                <span className="party-lfg-item__meta">
                  <span className="party-lfg-item__class">{entry.className ?? 'Classe'}</span>
                  <span className="party-lfg-item__level">· Lv {entry.level}</span>
                </span>
              </div>
              <span
                className="party-lfg-item__wait"
                title={`Na lista desde ${new Date(entry.createdAt).toLocaleTimeString('pt-BR')}`}
              >
                {formatWaiting(now - new Date(entry.createdAt).getTime())}
              </span>
              {actions && (
                <div className="party-lfg-item__actions" draggable={false} onDragStart={(e) => e.stopPropagation()}>
                  {actions(entry)}
                </div>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
