import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useFitRows } from '@/Shared/utils/useFitRows'
import { useMatchBottom } from '@/Shared/utils/useMatchBottom'
import { NewsPanel } from '@/Features/News/NewsPanel'
import { DiscordMembersPanel } from '@/Features/Dashboard/components/DiscordMembersPanel'
import { CerberusCountdown } from '@/Features/ServerInfo/components/CerberusCountdown'
import { useCerberusLaunched } from '@/Features/ServerInfo/hooks/useCerberusLaunched'
import { useMemberRanking } from '@/Domain/Member/hooks/useMembers'
import { useDiscordMembers, type DiscordMember } from '@/Domain/Discord/hooks/useDiscordMembers'
import { formatLastLogin } from '@/Shared/utils/memberLastLogin'
import { discordProfileUrl, openInDiscordApp } from '@/Shared/utils/discordLink'
import { useActiveEvents, useClaimEvent } from '@/Domain/Event/hooks/useEvents'
import { Button } from '@/Shared/ui/components/Button/Button'
import { MemberClassIcon } from '@/Shared/ui/components/MemberClassIcon/MemberClassIcon'
import { Panel } from '@/Shared/ui/components/Panel/Panel'
import { useAppToast } from '@/Shared/ui/components/AppToast/AppToast'
import './Dashboard.styles.scss'

const EVENT_PER_PAGE = 4
/** Natural ranking row (46px + 1px border; stretched to fill the viewport) and pagination block. */
const RANK_ROW_HEIGHT = 47
const PAGINATION_HEIGHT = 46

interface PaginationProps {
  page: number
  total: number
  onChange: (page: number) => void
  ref?: React.Ref<HTMLDivElement>
}

function Pagination({ page, total, onChange, ref }: PaginationProps) {
  if (total <= 1) return null
  return (
    <div className="dash-pagination" ref={ref}>
      <button
        className="dash-pagination__btn"
        onClick={() => onChange(Math.max(0, page - 1))}
        disabled={page === 0}
      >
        ‹
      </button>
      <span className="dash-pagination__info">
        {page + 1} <span className="dash-pagination__sep">/</span> {total}
      </span>
      <button
        className="dash-pagination__btn"
        onClick={() => onChange(Math.min(total - 1, page + 1))}
        disabled={page === total - 1}
      >
        ›
      </button>
    </div>
  )
}

/** "(Discord name)" in the member's Discord role color; opens their profile in the Discord app. */
function DiscordTag({ member, className }: { member?: DiscordMember; className: string }) {
  if (!member) return null
  return (
    <a
      href={discordProfileUrl(member.id)}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      style={member.color ? { color: member.color } : undefined}
      title={`Abrir ${member.name} no Discord`}
      onClick={(e) => openInDiscordApp(e, member.id)}
    >
      ({member.name})
    </a>
  )
}

export function DashboardPage() {
  const { data: ranking = [], isLoading } = useMemberRanking()
  const cerberusLaunched = useCerberusLaunched()
  const { data: discord } = useDiscordMembers()
  const discordBySiteId = new Map<number, DiscordMember>()
  discord?.groups.forEach((g) =>
    g.members.forEach((m) => m.siteMemberId && discordBySiteId.set(m.siteMemberId, m)),
  )
  const { data: events = [] } = useActiveEvents()
  const claimEvent = useClaimEvent()
  const { showToast } = useAppToast()
  const [passwords, setPasswords] = useState<Record<number, string>>({})
  const [claimErrors, setClaimErrors] = useState<Record<number, string>>({})
  const [rankPage, setRankPage] = useState(0)
  const [eventPage, setEventPage] = useState(0)

  // Side columns end exactly where the ranking panel ends; events and news split theirs in half.
  const sideRef = useRef<HTMLDivElement>(null)
  const rankingRef = useRef<HTMLDivElement>(null)
  const sideHeight = useMatchBottom(sideRef, rankingRef, !isLoading)

  const top3 = ranking.slice(0, 3)
  const rest = ranking.slice(3)

  // Rows per page follow the viewport height so the dashboard never scrolls; extra rows paginate.
  const rankListRef = useRef<HTMLUListElement>(null)
  const rankPaginationRef = useRef<HTMLDivElement>(null)
  const { perPage: rankPerPage, rowHeight: rankRowHeight } = useFitRows({
    listRef: rankListRef,
    paginationRef: rankPaginationRef,
    totalRows: rest.length,
    fallbackRowHeight: RANK_ROW_HEIGHT,
    fallbackPaginationHeight: PAGINATION_HEIGHT,
  })
  const rankTotalPages = Math.max(1, Math.ceil(rest.length / rankPerPage))
  // A taller window can leave the current page past the end — clamp instead of showing nothing.
  const currentRankPage = Math.min(rankPage, rankTotalPages - 1)
  const pagedRest = rest.slice(currentRankPage * rankPerPage, (currentRankPage + 1) * rankPerPage)
  // Last page of several: pad with numbered blank rows so the table keeps its height and the
  // pagination stays put.
  const emptyRankRows = rankTotalPages > 1 ? Math.max(0, rankPerPage - pagedRest.length) : 0

  const unclaimedEvents = events.filter((e) => !e.claimedByMe)
  const eventTotalPages = Math.ceil(unclaimedEvents.length / EVENT_PER_PAGE)
  const pagedEvents = unclaimedEvents.slice(
    eventPage * EVENT_PER_PAGE,
    (eventPage + 1) * EVENT_PER_PAGE,
  )

  const handleClaim = async (eventId: number) => {
    const password = passwords[eventId] ?? ''
    if (password.length !== 4) {
      setClaimErrors((prev) => ({
        ...prev,
        [eventId]: 'A senha deve ter exatamente 4 caracteres.',
      }))
      return
    }
    const event = events.find((e) => e.id === eventId)
    setClaimErrors((prev) => {
      const next = { ...prev }
      delete next[eventId]
      return next
    })

    try {
      await claimEvent.mutateAsync({ id: eventId, password })
      setPasswords((p) => ({ ...p, [eventId]: '' }))
      showToast(
        event
          ? `Evento "${event.objectiveName}" resgatado! +${event.points} pts`
          : 'Evento resgatado com sucesso!',
        'success',
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao resgatar evento'
      setClaimErrors((prev) => ({ ...prev, [eventId]: message }))
    }
  }

  if (isLoading) return <p>Carregando ranking...</p>

  return (
    <div className="dashboard">
      {/* Gone once the server opens; the columns move up into its space. */}
      {!cerberusLaunched && (
        <div className="dashboard__cerberus">
          <CerberusCountdown compact />
        </div>
      )}

      {/* ── Left: Ranking ─────────────────────────────────────────────────── */}
      <div className="dashboard__col dashboard__col--ranking" ref={rankingRef}>
      <Panel title="Ranking" code={`${ranking.length} MBR`}>
        <div className="podium">
          {[1, 0, 2].map((rankIdx) => {
            const member = top3[rankIdx]
            if (!member) return null
            const place = rankIdx + 1
            return (
              <div key={member.id} className={`podium__slot podium__slot--${place}`}>
                <div className="podium__card">
                  <MemberClassIcon
                    classImageUrl={member.classImageUrl}
                    classLabel={member.className}
                    size="md"
                  />
                  <Link to={`/profile/${member.id}`} className="podium__name podium__name--link">
                    {member.nickname}
                  </Link>
                  <DiscordTag member={discordBySiteId.get(member.id)} className="podium__discord" />
                  <span className="podium__level">Lv {member.level ?? 1}</span>
                  <span className="podium__points">{member.points}</span>
                </div>
                <div className="podium__pedestal">
                  <span className="podium__place">{place}</span>
                </div>
              </div>
            )
          })}
        </div>

        {rest.length > 0 && (
          <div className="ranking-rest">
            <div className="ranking-list__head" aria-hidden="true">
              <span>#</span>
              <span className="ranking-list__head-icon" />
              <span>Membro</span>
              <span>Lv</span>
              <span>Pontos</span>
              <span>Último login</span>
            </div>
            <ul
              className="ranking-list"
              ref={rankListRef}
              style={rankRowHeight ? ({ '--rank-row-h': `${rankRowHeight}px` } as React.CSSProperties) : undefined}
            >
              {pagedRest.map((m, i) => (
                <li key={m.id}>
                  <span className="ranking-list__pos">
                    {String(currentRankPage * rankPerPage + i + 4).padStart(2, '0')}
                  </span>
                  {m.classImageUrl && m.className ? (
                    <MemberClassIcon classImageUrl={m.classImageUrl} classLabel={m.className} />
                  ) : (
                    // Keep the icon column even without a class, or the row's cells shift left.
                    <span className="ranking-list__empty-icon" aria-hidden="true" />
                  )}
                  <span className="ranking-list__who">
                    <Link to={`/profile/${m.id}`} className="ranking-list__name">
                      {m.nickname}
                    </Link>
                    <DiscordTag member={discordBySiteId.get(m.id)} className="ranking-list__discord" />
                  </span>
                  <span className="ranking-list__level">{m.level ?? 1}</span>
                  <span className="ranking-list__pts">{m.points}</span>
                  <span className="ranking-list__login" title={formatLastLogin(m.lastLoginAt)}>
                    {formatLastLogin(m.lastLoginAt)}
                  </span>
                </li>
              ))}
              {Array.from({ length: emptyRankRows }, (_, i) => (
                <li key={`empty-${i}`} className="ranking-list__row--empty" aria-hidden="true">
                  <span className="ranking-list__pos">
                    {String(currentRankPage * rankPerPage + pagedRest.length + i + 4).padStart(2, '0')}
                  </span>
                  <span className="ranking-list__empty-icon" />
                  <span className="ranking-list__empty-name">—</span>
                </li>
              ))}
            </ul>
            <Pagination
              ref={rankPaginationRef}
              page={currentRankPage}
              total={rankTotalPages}
              onChange={setRankPage}
            />
          </div>
        )}
      </Panel>
      </div>

      {/* ── Right: Active Events (top half) + News (bottom half) ───────────── */}
      <div className="dashboard__side" ref={sideRef} style={sideHeight ? { height: sideHeight } : undefined}>
      <Panel
        title="Eventos Ativos"
        variant="amber"
        code={`${unclaimedEvents.length} OPS`}
        className="dashboard__col dashboard__col--events"
      >
        {unclaimedEvents.length === 0 ? (
          <p className="dashboard__empty">Nenhum evento ativo no momento.</p>
        ) : (
          <div className="events-paged">
            <ul className="event-list">
              {pagedEvents.map((event) => (
                <li key={event.id} className="event-list__item">
                  <div className="event-list__info">
                    <strong>{event.objectiveName}</strong>
                    <div className="event-list__meta">
                      <span className="event-list__pts">+{event.points} pts</span>
                      <small>
                        Expira{' '}
                        {new Date(event.expiresAt).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </small>
                    </div>
                  </div>
                  <div className="event-list__claim-wrap">
                    <div className="event-list__claim">
                      <input
                        type="password"
                        maxLength={4}
                        placeholder="Senha"
                        value={passwords[event.id] ?? ''}
                        onChange={(e) => {
                          const value = e.target.value
                          setPasswords((p) => ({ ...p, [event.id]: value }))
                          if (claimErrors[event.id]) {
                            setClaimErrors((prev) => {
                              const next = { ...prev }
                              delete next[event.id]
                              return next
                            })
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        onClick={() => handleClaim(event.id)}
                        loading={claimEvent.isPending && claimEvent.variables?.id === event.id}
                      >
                        Resgatar
                      </Button>
                    </div>
                    {claimErrors[event.id] && (
                      <p className="event-list__error">{claimErrors[event.id]}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <Pagination page={eventPage} total={eventTotalPages} onChange={setEventPage} />
          </div>
        )}
      </Panel>

      <NewsPanel className="dashboard__col dashboard__col--news" />
      </div>

      {/* ── Far right: Discord members (same height as the ranking) ─────────── */}
      <div
        className="dashboard__discord"
        style={sideHeight ? ({ '--side-height': `${sideHeight}px` } as React.CSSProperties) : undefined}
      >
        <DiscordMembersPanel />
      </div>
    </div>
  )
}
