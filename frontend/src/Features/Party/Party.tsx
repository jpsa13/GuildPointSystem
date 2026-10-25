import { useCallback, useState, type DragEvent, type ReactNode } from 'react'
import { useAuthContext } from '@/Features/Auth/contexts/AuthContext'
import {
  useAcceptPartyPending,
  useAddAllToPartyLfg,
  useCancelPartyPending,
  useCreateEmptyParty,
  useCreateParty,
  useDisbandParty,
  useKickPartyMember,
  useLeaveParty,
  useLeavePartyLfg,
  useRemoveFromPartyLfg,
  useMovePartyMember,
  usePartyBoard,
  usePartyMemberNotices,
  useRejectPartyPending,
  useRequestJoinParty,
  useTransferPartyLeader,
  useUpsertPartyLfg,
} from '@/Domain/Party/hooks/useParty'
import {
  readPartyDragData,
  setPartyDragData,
  type PartyDragPayload,
} from '@/Features/Party/utils/partyDrag'
import { Button } from '@/Shared/ui/components/Button/Button'
import { Panel } from '@/Shared/ui/components/Panel/Panel'
import { MemberClassIcon } from '@/Shared/ui/components/MemberClassIcon/MemberClassIcon'
import { useAppToast } from '@/Shared/ui/components/AppToast/AppToast'
import { playScheduleAlertSound } from '@/Shared/utils/notificationSound'
import { PartyCreateModal, type PartyCreateMode } from '@/Features/Party/components/PartyCreateModal'
import { PartyLfgList, WaitingTime } from '@/Features/Party/components/PartyLfgList'
import { sortByWaiting } from '@/Features/Party/utils/partyWait'
import { ConfirmDialog } from '@/Shared/ui/components/ConfirmDialog/ConfirmDialog'
import {
  formatPartyLabel,
  PARTY_MAX_MEMBERS,
  partyMapLabel,
  type MyPartyState,
  type PartyMap,
  type PartyMemberSummary,
  type PartyPendingItem,
  type PartySummary,
} from '@/Features/Party/Party.types'
import './Party.styles.scss'
import { usePartyDiscordCalls, useCallPartyDiscord, type PartyDiscordCall as DiscordCall } from '@/Domain/Party/hooks/usePartyDiscord'
import { PartyDiscordCall } from './components/PartyDiscordCall'

function pendingActionLabel(p: PartyPendingItem, my: MyPartyState): string {
  if (p.kind === 'JOIN_REQUEST' && my.canOrganizeParties && my.partyId !== p.partyId) {
    return `Pedido de entrada — ${partyMapLabel(p.partyMap)}`
  }
  if (p.kind === 'JOIN_REQUEST' && my.leader && my.partyId === p.partyId) {
    return 'Pediu para entrar na sua PT'
  }
  if (p.kind === 'INVITE' && !my.partyId) {
    return `Convite para PT (${partyMapLabel(p.partyMap)})`
  }
  if (p.kind === 'JOIN_REQUEST') {
    return `Pedido enviado — aguardando ${p.otherMember.nickname}`
  }
  return `Convite enviado para ${p.otherMember.nickname}`
}

function PendingMemberPreview({ member }: { member: PartyMemberSummary }) {
  return (
    <div className="party-pending__who">
      {member.classImageUrl ? (
        <MemberClassIcon
          classImageUrl={member.classImageUrl}
          classLabel={member.className ?? member.nickname}
          size="sm"
        />
      ) : (
        <span className="party-card__roster-fallback" aria-hidden="true">
          {member.nickname.slice(0, 1).toUpperCase()}
        </span>
      )}
      <div className="party-pending__who-text">
        <strong>{member.nickname}</strong>
        <span>
          Lv {member.level}
          {member.expPercent != null ? ` · ${member.expPercent.toFixed(2)}%` : ''}
        </span>
      </div>
    </div>
  )
}

function isIncomingPending(p: PartyPendingItem, my: MyPartyState): boolean {
  if (p.kind === 'JOIN_REQUEST') {
    if (my.canOrganizeParties) return true
    return my.leader && my.partyId === p.partyId
  }
  if (p.kind === 'INVITE') return !my.partyId
  return false
}

function isOutgoingPending(p: PartyPendingItem, my: MyPartyState): boolean {
  if (p.kind === 'JOIN_REQUEST') return !my.partyId
  if (p.kind === 'INVITE') return my.leader && my.partyId === p.partyId
  return false
}

function hasPendingJoinToParty(partyId: number, pending: PartyPendingItem[]): boolean {
  return pending.some((p) => p.kind === 'JOIN_REQUEST' && p.partyId === partyId)
}

function PartyIconButton({
  label,
  onClick,
  loading,
  children,
}: {
  label: string
  onClick: () => void
  loading?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className="party-icon-btn"
      aria-label={label}
      title={label}
      disabled={loading}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function IconLeader() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor">
      <path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7-6.3-4.6L5.7 21l2.3-7-6-4.6h7.6L12 2z" />
    </svg>
  )
}

function IconRemove() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

function PartyRoster({
  party,
  canManage,
  viewerId,
  onKick,
  onMakeLeader,
  kickLoadingId,
  leaderLoadingId,
  canDragMembers,
  onDropMember,
  dropHighlightSlot,
  onDragHighlight,
  movePending,
}: {
  party: PartySummary
  canManage: boolean
  viewerId?: number
  onKick: (memberId: number) => void
  onMakeLeader: (memberId: number) => void
  kickLoadingId: number | null
  leaderLoadingId: number | null
  canDragMembers: boolean
  onDropMember: (payload: PartyDragPayload) => void
  dropHighlightSlot: number | null
  onDragHighlight: (slot: number | null) => void
  movePending: boolean
}) {
  const slots = Array.from({ length: PARTY_MAX_MEMBERS }, (_, i) => party.members[i] ?? null)
  const canAcceptDrop = canManage && party.memberCount < PARTY_MAX_MEMBERS && !movePending

  const handleDragOverEmpty = (e: DragEvent, index: number) => {
    if (!canAcceptDrop || slots[index]) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    onDragHighlight(index)
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    onDragHighlight(null)
    const payload = readPartyDragData(e)
    if (!payload || !canAcceptDrop) return
    if (payload.fromPartyId === party.id) return
    onDropMember(payload)
  }

  return (
    <ul className="party-card__roster">
      {slots.map((member, index) => (
        <li
          key={member?.id ?? `empty-${index}`}
          className={[
            'party-card__roster-row',
            member ? '' : 'party-card__roster-row--empty',
            member && canDragMembers ? 'party-card__roster-row--draggable' : '',
            !member && dropHighlightSlot === index ? 'party-card__roster-row--drop-target' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          draggable={Boolean(member && canDragMembers)}
          onDragStart={(e) => {
            if (!member || !canDragMembers) return
            setPartyDragData(e, {
              memberId: member.id,
              fromPartyId: party.id,
              nickname: member.nickname,
            })
          }}
          onDragOver={(e) => handleDragOverEmpty(e, index)}
          onDragLeave={() => {
            if (dropHighlightSlot === index) onDragHighlight(null)
          }}
          onDrop={handleDrop}
        >
          {member ? (
            <>
              {member.classImageUrl ? (
                <MemberClassIcon
                  classImageUrl={member.classImageUrl}
                  classLabel={member.className ?? member.nickname}
                  size="sm"
                />
              ) : (
                <span className="party-card__roster-fallback" aria-hidden="true">
                  {member.nickname.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="party-card__roster-name" title={member.nickname}>
                {member.leader ? '★ ' : ''}
                {member.nickname}
              </span>
              <span className="party-card__roster-meta">
                Lv {member.level}
                {member.expPercent != null ? ` · ${member.expPercent.toFixed(2)}%` : ''}
              </span>
              {canManage && !member.leader && member.id !== viewerId && (
                <div
                  className="party-card__roster-actions"
                  draggable={false}
                  onDragStart={(e) => e.stopPropagation()}
                >
                  <PartyIconButton
                    label="Definir como líder"
                    loading={leaderLoadingId === member.id}
                    onClick={() => onMakeLeader(member.id)}
                  >
                    <IconLeader />
                  </PartyIconButton>
                  <PartyIconButton
                    label="Remover da PT"
                    loading={kickLoadingId === member.id}
                    onClick={() => onKick(member.id)}
                  >
                    <IconRemove />
                  </PartyIconButton>
                </div>
              )}
            </>
          ) : (
            <span className="party-card__roster-vago">Vago</span>
          )}
        </li>
      ))}
    </ul>
  )
}

function PartyCard({
  discordCall, discordUnavailable, discordLoading, onDiscordCall,
  party,
  my,
  viewerId,
  onRequestJoin,
  requestLoading,
  onDisband,
  disbandLoading,
  onKick,
  onMakeLeader,
  kickLoadingId,
  leaderLoadingId,
  canDragMembers,
  onDropMember,
  dropHighlightSlot,
  onDragHighlight,
  movePending,
}: {
  discordCall?: DiscordCall
  discordUnavailable?: string | null
  discordLoading: boolean
  onDiscordCall: () => void
  party: PartySummary
  my: MyPartyState
  viewerId?: number
  onRequestJoin: (partyId: number) => void
  requestLoading: boolean
  onDisband: (partyId: number) => void
  disbandLoading: boolean
  onKick: (partyId: number, memberId: number) => void
  onMakeLeader: (partyId: number, memberId: number) => void
  kickLoadingId: number | null
  leaderLoadingId: number | null
  canDragMembers: boolean
  onDropMember: (partyId: number, payload: PartyDragPayload) => void
  dropHighlightSlot: number | null
  onDragHighlight: (slot: number | null) => void
  movePending: boolean
}) {
  const inThisParty = my.partyId === party.id
  const isLeaderHere = inThisParty && my.leader
  const canManage = (my.leader && my.partyId === party.id) || my.canOrganizeParties
  const full = party.memberCount >= PARTY_MAX_MEMBERS
  const canRequest =
    !my.partyId &&
    !full &&
    party.leaderId != null &&
    !hasPendingJoinToParty(party.id, my.pending)

  return (
    <li className="party-card">
      <div className="party-card__head">
        <h3 className="party-card__title">
          {formatPartyLabel(party)}
          {party.memberCount === 0 ? ' · vazia' : ''}
        </h3>
        <span className="party-card__count">{party.memberCount}/{PARTY_MAX_MEMBERS}</span>
      </div>
      <PartyRoster
        party={party}
        canManage={canManage}
        viewerId={viewerId}
        onKick={(memberId) => onKick(party.id, memberId)}
        onMakeLeader={(memberId) => onMakeLeader(party.id, memberId)}
        kickLoadingId={kickLoadingId}
        leaderLoadingId={leaderLoadingId}
        canDragMembers={canDragMembers}
        onDropMember={(payload) => onDropMember(party.id, payload)}
        dropHighlightSlot={dropHighlightSlot}
        onDragHighlight={onDragHighlight}
        movePending={movePending}
      />
      <div className="party-card__actions">
        {canRequest && (
          <Button size="sm" loading={requestLoading} onClick={() => onRequestJoin(party.id)}>
            Pedir entrada
          </Button>
        )}
        {isLeaderHere && (
          <span className="party-pending__label">Você é o líder desta PT</span>
        )}
        {canManage && !isLeaderHere && my.canOrganizeParties && (
          <span className="party-pending__label">Gestão (liderança)</span>
        )}
        {canManage && (
          <Button
            size="sm"
            variant="secondary"
            loading={disbandLoading}
            onClick={() => onDisband(party.id)}
          >
            Dissolver PT
          </Button>
        )}
      </div>
      <PartyDiscordCall call={discordCall} canManage={canManage}
        unavailable={discordUnavailable} loading={discordLoading} onCall={onDiscordCall} />
    </li>
  )
}

export function PartyPage() {
  const { user } = useAuthContext()
  const { showToast } = useAppToast()
  const [kickLoadingId, setKickLoadingId] = useState<number | null>(null)
  const [leaderLoadingId, setLeaderLoadingId] = useState<number | null>(null)
  const [dropHighlight, setDropHighlight] = useState<{ partyId: number; slot: number } | null>(null)
  const [createModal, setCreateModal] = useState<PartyCreateMode | null>(null)
  const [disbandTarget, setDisbandTarget] = useState<PartySummary | null>(null)
  const closeDisband = useCallback(() => setDisbandTarget(null), [])

  const { data: board, isLoading } = usePartyBoard()
  const discord = usePartyDiscordCalls()
  const callDiscord = useCallPartyDiscord()
  const createParty = useCreateParty()
  const createEmptyParty = useCreateEmptyParty()
  const movePartyMember = useMovePartyMember()
  const disbandParty = useDisbandParty()
  const leaveParty = useLeaveParty()
  const requestJoin = useRequestJoinParty()
  const kickMember = useKickPartyMember()
  const transferLeader = useTransferPartyLeader()
  const acceptPending = useAcceptPartyPending()
  const rejectPending = useRejectPartyPending()
  const cancelPending = useCancelPartyPending()
  const upsertLfg = useUpsertPartyLfg()
  const leaveLfg = useLeavePartyLfg()
  const addAllToLfg = useAddAllToPartyLfg()
  const removeFromLfg = useRemoveFromPartyLfg()
  const [lfgRemovingId, setLfgRemovingId] = useState<number | null>(null)
  const [lfgSearch, setLfgSearch] = useState('')
  const [addAllOpen, setAddAllOpen] = useState(false)

  const onPartyNotice = useCallback(
    (notice: { message: string }) => {
      playScheduleAlertSound()
      showToast(notice.message, 'error', { durationMs: 10_000 })
    },
    [showToast],
  )
  usePartyMemberNotices(user?.memberId, onPartyNotice)

  // Every action reports its failure (PT just filled up, request already handled by someone else…).
  const failToast = useCallback(
    (err: unknown) => showToast(err instanceof Error ? err.message : 'Não foi possível concluir a ação.', 'error'),
    [showToast],
  )
  const onFail = { onError: failToast }

  const my: MyPartyState = board?.my ?? {
    memberId: user?.memberId ?? 0,
    partyId: null,
    partyNumber: null,
    partyMap: null,
    partySpot: null,
    leader: false,
    canOrganizeParties: false,
    lfg: null,
    pending: [],
  }

  const inParty = my.partyId != null
  const onLfg = my.lfg != null

  const incoming = my.pending.filter((p) => isIncomingPending(p, my))
  const outgoing = my.pending.filter((p) => isOutgoingPending(p, my))

  const handleCreateModalSubmit = (payload: { map: PartyMap; spot?: string }) => {
    const onDone = {
      onSuccess: () => {
        setCreateModal(null)
        showToast('PT criada com sucesso.', 'success')
      },
      onError: failToast,
    }
    if (createModal === 'empty') {
      createEmptyParty.mutate(payload, onDone)
    } else {
      createParty.mutate(payload, onDone)
    }
  }

  const canDragFromLfg = my.canOrganizeParties || my.leader

  const handleMoveMember = useCallback(
    (partyId: number, payload: PartyDragPayload) => {
      const target = board?.parties.find((p) => p.id === partyId)
      movePartyMember.mutate(
        { partyId, memberId: payload.memberId, fromPartyId: payload.fromPartyId },
        {
          onSuccess: () => {
            setDropHighlight(null)
            const label = target ? formatPartyLabel(target) : `PT #${partyId}`
            showToast(`${payload.nickname} adicionado à ${label}.`, 'success')
          },
          onError: (err) => {
            const message = err instanceof Error ? err.message : 'Não foi possível mover o membro.'
            showToast(message, 'error')
          },
        },
      )
    },
    [movePartyMember, showToast, board?.parties],
  )

  const myPartyLabel =
    my.partyNumber != null && my.partyMap
      ? formatPartyLabel({
          number: my.partyNumber,
          map: my.partyMap,
          spot: my.partySpot,
        })
      : my.partyId != null
        ? `PT #${my.partyId}`
        : ''

  return (
    <div className="party-page">
      {createModal && (
        <PartyCreateModal
          mode={createModal}
          loading={createParty.isPending || createEmptyParty.isPending}
          onClose={() => setCreateModal(null)}
          onSubmit={handleCreateModalSubmit}
        />
      )}

      {incoming.length > 0 && (
        <Panel title="Pendências" code={`${incoming.length} REQ`}>
          <div className="party-pending">
            {incoming.map((p) => (
              <div key={p.id} className="party-pending__item">
                <div className="party-pending__main">
                  <PendingMemberPreview member={p.otherMember} />
                  <span className="party-pending__label">{pendingActionLabel(p, my)}</span>
                </div>
                <div className="party-pending__actions">
                  <Button
                    size="sm"
                    loading={acceptPending.isPending && acceptPending.variables === p.id}
                    onClick={() => acceptPending.mutate(p.id, onFail)}
                  >
                    Aceitar
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={rejectPending.isPending && rejectPending.variables === p.id}
                    onClick={() => rejectPending.mutate(p.id, onFail)}
                  >
                    Recusar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {outgoing.length > 0 && (
        <Panel title="Aguardando resposta" code={`${outgoing.length} OUT`}>
          <div className="party-pending">
            {outgoing.map((p) => (
              <div key={p.id} className="party-pending__item">
                <div className="party-pending__main">
                  <PendingMemberPreview member={p.otherMember} />
                  <span className="party-pending__label">{pendingActionLabel(p, my)}</span>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={cancelPending.isPending && cancelPending.variables === p.id}
                  onClick={() => cancelPending.mutate(p.id, onFail)}
                >
                  Cancelar
                </Button>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {inParty && (
        <div className="party-my">
          <span>
            Você está na {myPartyLabel}
            {my.leader ? ' (líder)' : ''}
          </span>
          <div className="party-card__actions">
            {my.canOrganizeParties && (
              <Button size="sm" variant="secondary" onClick={() => setCreateModal('empty')}>
                Criar PT vazia
              </Button>
            )}
            {my.leader && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  const mine = board?.parties.find((p) => p.id === my.partyId)
                  if (mine) setDisbandTarget(mine)
                }}
              >
                Dissolver PT
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              loading={leaveParty.isPending}
              onClick={() => my.partyId && leaveParty.mutate(my.partyId, onFail)}
            >
              Sair da PT
            </Button>
          </div>
        </div>
      )}

      {!inParty && (
        <Panel title="Ações rápidas" code="PT">
          <div className="party-card__actions">
            <Button onClick={() => setCreateModal('member')}>Criar PT</Button>
            {my.canOrganizeParties && (
              <Button variant="secondary" onClick={() => setCreateModal('empty')}>
                Criar PT vazia
              </Button>
            )}
            {onLfg ? (
              <Button variant="secondary" loading={leaveLfg.isPending} onClick={() => leaveLfg.mutate(undefined, onFail)}>
                Sair da lista de espera
              </Button>
            ) : (
              <Button variant="secondary" loading={upsertLfg.isPending} onClick={() => upsertLfg.mutate({}, onFail)}>
                Entrar na lista de espera
              </Button>
            )}
          </div>
          {my.lfg && board && (
            <p className="party-page__lfg-status">
              Você está na lista de espera há{' '}
              <span className="party-my__wait">
                <WaitingTime since={my.lfg.createdAt} />
              </span>
              {' · posição '}
              {sortByWaiting(board.lfg).findIndex((e) => e.memberId === my.lfg!.memberId) + 1}
              {` de ${board.lfg.length}`}
            </p>
          )}
        </Panel>
      )}

      {isLoading && <p className="party-page__empty">Carregando...</p>}

      {board && (
        <div className="party-page__grid">
          <Panel title="PTs abertas" code={`${board.parties.length} PT`} flush>
            {board.parties.length === 0 ? (
              <p className="party-page__empty party-page__empty--panel">Nenhuma PT aberta.</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {board.parties.map((party) => (
                    <PartyCard
                      key={party.id}
                      discordCall={discord.data?.calls.find((call) => call.partyId === party.id)}
                      discordUnavailable={discord.isError ? 'Não foi possível consultar as chamadas do Discord.'
                        : !discord.data ? 'Conectando ao Discord…' : !discord.data.available ? discord.data.reason : null}
                      discordLoading={callDiscord.isPending && callDiscord.variables === party.id}
                      onDiscordCall={() => callDiscord.mutate(party.id, onFail)}
                      party={party}
                      my={my}
                      viewerId={user?.memberId}
                      onRequestJoin={(id) => requestJoin.mutate(id, onFail)}
                      requestLoading={requestJoin.isPending && requestJoin.variables === party.id}
                      onDisband={() => setDisbandTarget(party)}
                      disbandLoading={disbandParty.isPending && disbandParty.variables === party.id}
                      onKick={(partyId, memberId) => {
                        setKickLoadingId(memberId)
                        kickMember.mutate(
                          { partyId, memberId },
                          { onSettled: () => setKickLoadingId(null), onError: failToast },
                        )
                      }}
                      onMakeLeader={(partyId, memberId) => {
                        setLeaderLoadingId(memberId)
                        transferLeader.mutate(
                          { partyId, memberId },
                          { onSettled: () => setLeaderLoadingId(null), onError: failToast },
                        )
                      }}
                      kickLoadingId={kickLoadingId}
                      leaderLoadingId={leaderLoadingId}
                      canDragMembers={my.canOrganizeParties}
                      onDropMember={handleMoveMember}
                      dropHighlightSlot={
                        dropHighlight?.partyId === party.id ? dropHighlight.slot : null
                      }
                      onDragHighlight={(slot) => {
                        setDropHighlight(slot == null ? null : { partyId: party.id, slot })
                      }}
                      movePending={movePartyMember.isPending}
                    />
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Lista de espera"
            code={`${board.lfg.length} LFP`}
            flush
            actions={
              <>
                {board.lfg.length > 0 && (
                  <input
                    type="search"
                    className="party-lfg-search"
                    placeholder="Buscar membro"
                    aria-label="Buscar membro na lista de espera"
                    value={lfgSearch}
                    onChange={(e) => setLfgSearch(e.target.value)}
                  />
                )}
                {my.canOrganizeParties && (
                  <Button size="sm" variant="secondary" onClick={() => setAddAllOpen(true)}>
                    Adicionar todos
                  </Button>
                )}
              </>
            }
          >
            {board.lfg.length === 0 ? (
              <p className="party-page__empty party-page__empty--panel">Ninguém na lista de espera.</p>
            ) : (
              <PartyLfgList
                entries={board.lfg}
                search={lfgSearch}
                viewerId={user?.memberId}
                canDrag={canDragFromLfg}
                actions={
                  my.canOrganizeParties
                    ? (entry) => (
                        <PartyIconButton
                          label={`Remover ${entry.nickname} da lista de espera`}
                          loading={lfgRemovingId === entry.memberId}
                          onClick={() => {
                            setLfgRemovingId(entry.memberId)
                            removeFromLfg.mutate(entry.memberId, {
                              onSettled: () => setLfgRemovingId(null),
                              onError: failToast,
                            })
                          }}
                        >
                          <IconRemove />
                        </PartyIconButton>
                      )
                    : undefined
                }
              />
            )}
          </Panel>
        </div>
      )}

      <ConfirmDialog
        open={addAllOpen}
        title="Adicionar todos à lista de espera"
        code="LFP"
        confirmLabel="Adicionar todos"
        loading={addAllToLfg.isPending}
        onConfirm={() => {
          const before = board?.lfg.length ?? 0
          addAllToLfg.mutate(undefined, {
            onSuccess: (data) => {
              const added = data.lfg.length - before
              showToast(
                added > 0
                  ? `${added} ${added === 1 ? 'membro adicionado' : 'membros adicionados'} à lista de espera.`
                  : 'Todos os membros já estão em uma PT ou na lista de espera.',
                'success',
              )
              setAddAllOpen(false)
            },
            onError: (err) => {
              failToast(err)
              setAddAllOpen(false)
            },
          })
        }}
        onCancel={() => setAddAllOpen(false)}
      >
        <p>Todos os membros aprovados que não estão em uma PT entram na lista de espera.</p>
        <p className="confirm-dialog__note">Quem já está em uma PT ou na lista continua como está.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={disbandTarget !== null}
        title={`Dissolver ${disbandTarget ? formatPartyLabel(disbandTarget) : 'PT'}`}
        code="PT"
        confirmLabel="Dissolver PT"
        loading={disbandParty.isPending}
        onConfirm={() =>
          disbandTarget &&
          disbandParty.mutate(disbandTarget.id, {
            onSuccess: () => {
              showToast('PT dissolvida. Os membros voltaram para a lista de espera.', 'success')
              setDisbandTarget(null)
            },
            onError: (err) => {
              failToast(err)
              setDisbandTarget(null)
            },
          })
        }
        onCancel={closeDisband}
      >
        <p>
          {disbandTarget && disbandTarget.memberCount > 0 ? (
            <>
              <strong>{disbandTarget.members.map((m) => m.nickname).join(', ')}</strong>{' '}
              {disbandTarget.memberCount > 1 ? 'voltam' : 'volta'} para a lista de espera e são avisados na hora.
            </>
          ) : (
            'A PT está vazia e será removida.'
          )}
        </p>
        <p className="confirm-dialog__note">Pedidos e convites pendentes desta PT são cancelados.</p>
      </ConfirmDialog>
    </div>
  )
}
