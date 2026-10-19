import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useOnlineMembers, type OnlineMember } from '@/Domain/Presence/hooks/usePresence'
import { PRESENCE_PAGE_LABELS, presencePageLabel, type PresencePage } from '@/Domain/Presence/presencePages'
import { formatWaiting } from '@/Features/Party/utils/partyWait'
import { MemberClassIcon } from '@/Shared/ui/components/MemberClassIcon/MemberClassIcon'
import { Panel } from '@/Shared/ui/components/Panel/Panel'
import { useServerNow } from '@/Shared/utils/useServerNow'
import './Online.styles.scss'

type SortKey = 'name' | 'page' | 'ping'

const SORT_LABELS: Record<SortKey, string> = { name: 'Nome', page: 'Página', ping: 'Ping' }

/** Ping bands as members feel them on bids and live updates. */
function pingLevel(rttMs: number | null): 'good' | 'fair' | 'bad' | 'unknown' {
  if (rttMs == null) return 'unknown'
  if (rttMs < 100) return 'good'
  if (rttMs < 250) return 'fair'
  return 'bad'
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function sortMembers(members: OnlineMember[], key: SortKey): OnlineMember[] {
  const byName = (a: OnlineMember, b: OnlineMember) => a.nickname.localeCompare(b.nickname, 'pt-BR')
  return [...members].sort((a, b) => {
    if (key === 'page') return presencePageLabel(a.page, a.detail).localeCompare(presencePageLabel(b.page, b.detail), 'pt-BR') || byName(a, b)
    if (key === 'ping') return (b.rttMs ?? -1) - (a.rttMs ?? -1) || byName(a, b)
    return byName(a, b)
  })
}

export function OnlinePage() {
  const { data, isLoading, isError } = useOnlineMembers()
  const [sort, setSort] = useState<SortKey>('name')
  const now = useServerNow()
  const members = useMemo(() => data?.members ?? [], [data])

  const byPage = useMemo(() => {
    const counts = new Map<string, number>()
    for (const m of members) counts.set(m.page, (counts.get(m.page) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [members])
  const medianPing = median(members.map((m) => m.rttMs).filter((v): v is number => v != null))
  const sockJsCount = members.filter((m) => m.transport === 'sockjs').length
  const sorted = useMemo(() => sortMembers(members, sort), [members, sort])

  if (isLoading) return <p>Carregando quem está online...</p>
  if (isError) return <p>Não foi possível carregar a lista de online.</p>

  return (
    <div className="online-page">
      <Panel title="Resumo" code="LIVE">
        <div className="online-summary">
          <div className="online-summary__stat">
            <span className="online-summary__label">Online</span>
            <span className="online-summary__value">{members.length}</span>
          </div>
          <div className="online-summary__stat">
            <span className="online-summary__label">Ping mediano</span>
            <span className={`online-summary__value online-ping--${pingLevel(medianPing)}`}>
              {medianPing == null ? '—' : `${medianPing} ms`}
            </span>
          </div>
          <div className="online-summary__stat">
            <span className="online-summary__label">Via SockJS</span>
            <span className="online-summary__value">{sockJsCount}</span>
          </div>
        </div>
        {byPage.length > 0 && (
          <ul className="online-pages" aria-label="Membros por página">
            {byPage.map(([page, count]) => (
              <li key={page} className="online-pages__chip">
                {PRESENCE_PAGE_LABELS[page as PresencePage] ?? PRESENCE_PAGE_LABELS.other}
                <strong>{count}</strong>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title="Online agora"
        code={`${members.length} ON`}
        flush
        actions={
          <div className="online-sort" role="group" aria-label="Ordenar por">
            {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
              <button
                key={key}
                type="button"
                className={`online-sort__btn${sort === key ? ' online-sort__btn--active' : ''}`}
                aria-pressed={sort === key}
                onClick={() => setSort(key)}
              >
                {SORT_LABELS[key]}
              </button>
            ))}
          </div>
        }
      >
        {sorted.length === 0 ? (
          <p className="online-page__empty">Ninguém conectado no momento.</p>
        ) : (
          <ul className="online-list">
            {sorted.map((m) => (
              <li key={m.memberId} className={`online-list__item${m.hidden ? ' online-list__item--hidden' : ''}`}>
                <span className="online-list__icon">
                  <MemberClassIcon classImageUrl={m.classImageUrl} classLabel={m.className} size="md" />
                </span>
                <div className="online-list__who">
                  <Link to={`/profile/${m.memberId}`} className="online-list__name">
                    {m.nickname}
                  </Link>
                  <small>{m.className ?? '—'}</small>
                </div>
                <div className="online-list__where">
                  <span className="online-list__page">{presencePageLabel(m.page, m.detail)}</span>
                  <small>
                    online há {formatWaiting(Math.max(0, now - Date.parse(m.onlineSince)))}
                    {m.hidden && ' · aba em segundo plano'}
                    {m.tabs > 1 && ` · ${m.tabs} abas`}
                  </small>
                </div>
                <div className="online-list__tags">
                  {m.transport === 'sockjs' && (
                    <span className="online-list__tag" title="Conexão de reserva (sem WebSocket nativo)">
                      SockJS
                    </span>
                  )}
                  <span
                    className={`online-list__ping online-ping--${pingLevel(m.rttMs)}`}
                    title="Ida e volta navegador → servidor → navegador"
                  >
                    {m.rttMs == null ? '— ms' : `${m.rttMs} ms`}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}
