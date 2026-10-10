import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  serverNow,
  useAuction,
  useAuctionMessages,
  useAuctionTieBreak,
  useCancelAuction,
  useDeleteAuction,
  usePlaceBid,
  useSendAuctionMessage,
} from '@/Domain/Auction/hooks/useAuction'
import { useAuthContext } from '@/Features/Auth/contexts/AuthContext'
import { useAppToast } from '@/Shared/ui/components/AppToast/AppToast'
import { isAuctionFinished } from '@/Domain/types/models'
import { useCurrentMember } from '@/Domain/Member/hooks/useMembers'
import { useItem } from '@/Domain/Item/hooks/useItems'
import { useItemSeeds } from '@/Domain/Seed/hooks/useItemSeeds'
import { Roulette } from '@/Features/Auction/components/Roulette/Roulette'
import type { RoulettePhase } from '@/Features/Auction/components/Roulette/Roulette.types'
import { Button } from '@/Shared/ui/components/Button/Button'
import { ConfirmDialog } from '@/Shared/ui/components/ConfirmDialog/ConfirmDialog'
import { Panel } from '@/Shared/ui/components/Panel/Panel'
import { ItemCard } from '@/Features/Items/components/ItemCard/ItemCard'
import type { AuctionItem, SeedOption } from '@/Domain/types/models'
import './Auction.styles.scss'

// ─── Live countdown (server clock) ────────────────────────────────────────────

function useCountdown(endsAt: string) {
  const [remaining, setRemaining] = useState(0)
  useEffect(() => {
    if (!endsAt) return
    const tick = () => {
      setRemaining(Math.max(0, Math.ceil((new Date(endsAt).getTime() - serverNow()) / 1000)))
    }
    tick()
    const timer = setInterval(tick, 200)
    return () => clearInterval(timer)
  }, [endsAt])
  return remaining
}

function formatTime(seconds: number) {
  if (seconds <= 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ─── Single auction item card (fetches full data) ─────────────────────────────

function AuctionItemCard({
  auctionItem,
  weaponCasts,
}: {
  auctionItem: AuctionItem
  weaponCasts: SeedOption[]
}) {
  const { data: item } = useItem(auctionItem.itemId)

  if (!item) {
    return (
      <div className="auction-item-placeholder">
        {auctionItem.imageUrl && (
          <img src={auctionItem.imageUrl} alt={auctionItem.itemName} className="auction-item-placeholder__img" />
        )}
        <span>{auctionItem.itemName}</span>
      </div>
    )
  }

  return (
    <div className="auction-item-wrap">
      <ItemCard item={item} canAdmin={false} onDelete={() => {}} weaponCasts={weaponCasts} />
      {auctionItem.quantity > 1 && (
        <div className="auction-item-wrap__qty">x{auctionItem.quantity}</div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Aberto',
  DOLE: 'DOLE',
  TIE_BREAK: 'Empate',
  CLOSED: 'Encerrado',
  CANCELLED: 'Cancelado',
}

const QUICK_INCREMENTS = [5, 10, 50, 100, 500]
const FEEDBACK_MS = 4000

type BidFeedback = { kind: 'ok' | 'error'; text: string }

export function AuctionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const auctionId = Number(id)

  const navigate = useNavigate()
  const { showToast } = useAppToast()
  const { hasRole } = useAuthContext()
  const canManage = hasRole('ADMINISTRADOR') // Líder ranks above Administrador

  // Someone deleted this auction while we were watching it.
  const onDeleted = useCallback(() => {
    showToast(`Leilão #${String(auctionId).padStart(3, '0')} foi excluído.`, 'info')
    navigate('/auctions')
  }, [auctionId, navigate, showToast])

  const { data: auction, isLoading, isError } = useAuction(auctionId, onDeleted)
  const tieBreak = useAuctionTieBreak(auctionId)
  const { data: messages = [] } = useAuctionMessages(auctionId)
  const { data: member } = useCurrentMember()
  const { data: weaponCasts = [] } = useItemSeeds('WEAPON_CAST')
  const placeBid = usePlaceBid()
  const sendMessage = useSendAuctionMessage()
  const cancelAuction = useCancelAuction()
  const deleteAuction = useDeleteAuction()

  const [bidAmount, setBidAmount] = useState('')
  const [chatText, setChatText] = useState('')
  const [feedback, setFeedback] = useState<BidFeedback | null>(null)
  const [rouletteShown, setRouletteShown] = useState(false)
  const [rouletteStopped, setRouletteStopped] = useState(false)
  const [confirm, setConfirm] = useState<'cancel' | 'delete' | null>(null)
  const closeConfirm = useCallback(() => setConfirm(null), [])
  const chatEndRef = useRef<HTMLDivElement>(null)

  const remaining = useCountdown(auction?.endsAt ?? '')

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!feedback) return
    const timer = setTimeout(() => setFeedback(null), FEEDBACK_MS)
    return () => clearTimeout(timer)
  }, [feedback])

  // Once this viewer has watched a tie-break start, the winner stays hidden until the wheel stops.
  if (auction?.status === 'TIE_BREAK' && !rouletteShown) setRouletteShown(true)

  const tieSegments = auction?.tied
    ? auction.tiedMemberNicknames.map((nickname, i) => ({
        id: auction.tiedMemberIds[i] ?? i,
        label: nickname,
      }))
    : []

  const submitBid = async (amount: number) => {
    if (!amount || amount < 1) return
    try {
      await placeBid.mutateAsync({ id: auctionId, amount })
      setFeedback({ kind: 'ok', text: `Lance de ${amount} pts aceito.` })
      setBidAmount('')
    } catch (err) {
      setFeedback({ kind: 'error', text: err instanceof Error ? err.message : 'Lance recusado.' })
    }
  }

  const quickBid = (increment: number) => {
    const current = auction?.currentBid ?? 0
    setBidAmount(String(current + increment))
  }

  const handleCancel = async () => {
    try {
      await cancelAuction.mutateAsync(auctionId)
      showToast('Leilão encerrado. Pontos reservados devolvidos.', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Não foi possível encerrar o leilão.', 'error')
    } finally {
      setConfirm(null)
    }
  }

  const handleDelete = async () => {
    try {
      await deleteAuction.mutateAsync(auctionId)
      showToast('Leilão excluído.', 'success')
      navigate('/auctions')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Não foi possível excluir o leilão.', 'error')
      setConfirm(null)
    }
  }

  const handleChat = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatText.trim()) return
    try {
      await sendMessage.mutateAsync({ id: auctionId, content: chatText })
      setChatText('')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Não foi possível enviar a mensagem.', 'error')
    }
  }

  if (isLoading) {
    return <p className="auction-detail__loading">Carregando leilão...</p>
  }

  if (isError || !auction) {
    return <p className="auction-detail__loading">Leilão não encontrado.</p>
  }

  const isClosed = auction.status === 'CLOSED'
  const isCancelled = auction.status === 'CANCELLED'
  const isFinished = isAuctionFinished(auction.status)
  const isTieBreak = auction.status === 'TIE_BREAK'
  const lotLabel = `#${String(auction.id).padStart(3, '0')}`
  // Whoever holds the current bid has points reserved here; cancelling releases them.
  const reservedNames = auction.tied
    ? auction.tiedMemberNicknames
    : auction.leaderNickname
      ? [auction.leaderNickname]
      : []
  const canBid = auction.status === 'OPEN' || auction.status === 'DOLE'
  const isUrgent = canBid && remaining > 0 && remaining <= 15
  const iAmLeading = !!(member && (
    auction.tied
      ? auction.tiedMemberIds?.includes(member.id)
      : auction.leaderId !== null && auction.leaderId === member.id
  ))
  // Not leading here → none of my reserve is in this auction, so this is my true maximum.
  const myMax = member?.availablePoints ?? 0
  const canTieAllIn = canBid && !iAmLeading && auction.currentBid > 0 && myMax === auction.currentBid
  const canOutbid = canBid && !iAmLeading && myMax > auction.currentBid

  // A closed auction still tied at the final amount was decided by the roulette.
  const closedWinnerIndex =
    isClosed && auction.tied && auction.winnerId != null
      ? auction.tiedMemberIds.indexOf(auction.winnerId)
      : -1
  const winnerIndex = tieBreak?.winnerIndex ?? (closedWinnerIndex >= 0 ? closedWinnerIndex : null)
  const showRoulette = tieSegments.length > 1 && (isTieBreak || closedWinnerIndex >= 0)
  // Viewers who watched the spin wait for the wheel; a later visit (or reload) sees the result directly.
  const revealWinner = isClosed && (!rouletteShown || rouletteStopped)

  let roulettePhase: RoulettePhase = 'idle'
  if (isTieBreak && auction.tieBreakPhase >= 2) {
    roulettePhase = tieBreak?.winnerIndex != null ? 'landing' : 'spinning'
  } else if (isClosed && winnerIndex !== null) {
    roulettePhase = rouletteShown ? 'landing' : 'stopped'
  }

  return (
    <div className="auction-detail">
      {/* ── LEFT ────────────────────────────────────────────────────────────── */}
      <div className="auction-detail__left">
        <Panel
          title={`Lote #${String(auction.id).padStart(3, '0')}`}
          code={`${auction.items.length} ITM`}
          className="auction-detail__lot"
        >
          <div className="auction-detail__items">
            {auction.items.map((ai) => (
              <AuctionItemCard key={ai.itemId} auctionItem={ai} weaponCasts={weaponCasts} />
            ))}
          </div>
        </Panel>

        {/* Tie-break: countdown → blind spin → landing → reveal */}
        {showRoulette && (
          <Panel title="Desempate" variant="danger" code="RNG" className="auction-tiebreak">
            {isTieBreak && auction.tieBreakPhase === 1 ? (
              <div className="auction-tiebreak__countdown" role="alert">
                <span className="auction-tiebreak__number">{Math.max(remaining, 0)}</span>
                <p className="auction-tiebreak__text">
                  Empate em <strong>{auction.currentBid} pts</strong> entre{' '}
                  <strong>{auction.tiedMemberNicknames.join(', ')}</strong>.
                  <br />
                  O vencedor será sorteado aleatoriamente pela roleta.
                </p>
              </div>
            ) : (
              <>
                <Roulette
                  segments={tieSegments}
                  phase={roulettePhase}
                  winnerIndex={winnerIndex}
                  // Stop slightly before the server closes the auction so the name never leads the wheel.
                  // Without a live draw (reloaded mid-spin) the wheel just lands quickly once it closes.
                  landingMs={tieBreak?.winnerIndex != null ? Math.max(1500, tieBreak.landingMs - 600) : 2500}
                  onStopped={() => setRouletteStopped(true)}
                />
                <p className="auction-tiebreak__status">
                  {revealWinner && auction.winnerNickname
                    ? `Vencedor: ${auction.winnerNickname}`
                    : roulettePhase === 'landing'
                      ? 'Parando...'
                      : 'Sorteando...'}
                </p>
              </>
            )}
          </Panel>
        )}

        {/* Bid console */}
        <Panel
          title="Console de lance"
          variant={auction.status === 'DOLE' ? 'amber' : 'default'}
          code={STATUS_LABEL[auction.status] ?? auction.status}
          className="auction-console"
        >
          <div className="auction-console__displays">
            <div className="auction-console__display auction-console__display--bid">
              <span className="auction-console__label">Lance atual</span>
              <span className="auction-console__value">{auction.currentBid}</span>
            </div>
            <div
              className={`auction-console__display auction-console__display--timer${isUrgent ? ' auction-console__display--urgent' : ''}`}
            >
              <span className="auction-console__label">Tempo</span>
              <span className="auction-console__value">
                {isFinished || isTieBreak ? '--:--' : formatTime(remaining)}
              </span>
            </div>
          </div>

          <dl className="auction-console__rows">
            <div>
              <dt>Status</dt>
              <dd>
                <span className={`auction-detail__badge auction-detail__badge--${auction.status.toLowerCase()}`}>
                  {STATUS_LABEL[auction.status] ?? auction.status}
                </span>
              </dd>
            </div>
            {member && (
              <div>
                <dt>Seu saldo disponível</dt>
                <dd className="auction-console__mono">{member.availablePoints} pts</dd>
              </div>
            )}
            {!isFinished && auction.tied && (
              <div>
                <dt>Empatados ({auction.tiedCount})</dt>
                <dd className="auction-detail__tied-names">
                  {auction.tiedMemberNicknames.map((nickname, i) => (
                    <span
                      key={auction.tiedMemberIds[i] ?? nickname}
                      className={
                        member && auction.tiedMemberIds[i] === member.id
                          ? 'auction-detail__leader--me'
                          : 'auction-detail__winner-name'
                      }
                    >
                      {nickname}
                    </span>
                  ))}
                </dd>
              </div>
            )}
            {!isFinished && !auction.tied && auction.leaderNickname && (
              <div>
                <dt>Vencendo</dt>
                <dd>
                  <span className={iAmLeading ? 'auction-detail__leader--me' : 'auction-detail__winner-name'}>
                    {iAmLeading ? 'Você' : auction.leaderNickname}
                  </span>
                </dd>
              </div>
            )}
            {isClosed && (
              <div>
                <dt>Vencedor</dt>
                <dd>
                  <span className="auction-detail__winner-name">
                    {!revealWinner ? '...' : auction.winnerNickname ?? 'Sem lances'}
                  </span>
                </dd>
              </div>
            )}
            {isCancelled && (
              <div>
                <dt>Resultado</dt>
                <dd className="auction-console__mono">Encerrado sem vencedor · ninguém cobrado</dd>
              </div>
            )}
          </dl>

          {/* DOLE system alert */}
          {auction.status === 'DOLE' && (
            <div className="auction-dole" role="alert">
              <span className="auction-dole__tag">Sistema</span>
              <span className="auction-dole__text">DOLE {auction.dolePhase}</span>
            </div>
          )}

          {/* "You're winning / tied" banner */}
          {canBid && iAmLeading && (
            <div className="auction-detail__leading-banner">
              {auction.tied
                ? `Você está empatado (all-in) entre ${auction.tiedCount} pessoas`
                : 'Seu lance é o atual vencedor — você está ganhando!'}
            </div>
          )}

          {/* Bid input — hidden if I'm already leading */}
          {canBid && !iAmLeading && (
            <div className="auction-detail__bid">
              <input
                type="number"
                min={1}
                value={bidAmount}
                onChange={(e) => setBidAmount(e.target.value)}
                placeholder={`Maior que ${auction.currentBid}`}
                className="auction-detail__bid-input"
                onKeyDown={(e) => e.key === 'Enter' && submitBid(Number(bidAmount))}
              />
              <div className="auction-detail__bid-actions">
                {QUICK_INCREMENTS.map((inc) => (
                  <Button
                    key={inc}
                    variant="secondary"
                    size="sm"
                    disabled={auction.currentBid + inc > myMax}
                    onClick={() => quickBid(inc)}
                  >
                    +{inc}
                  </Button>
                ))}
                <Button
                  onClick={() => submitBid(Number(bidAmount))}
                  loading={placeBid.isPending}
                  disabled={!bidAmount}
                >
                  Lance
                </Button>
              </div>
              {(canOutbid || canTieAllIn) && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => submitBid(myMax)}
                  disabled={placeBid.isPending}
                >
                  {canTieAllIn ? `Empatar com all-in (${myMax})` : `All-in (${myMax})`}
                </Button>
              )}
              {!canOutbid && !canTieAllIn && member && (
                <p className="auction-detail__bid-hint">
                  Seu saldo disponível ({myMax}) não cobre o lance atual.
                </p>
              )}
              {feedback && (
                <p
                  className={`auction-detail__bid-feedback auction-detail__bid-feedback--${feedback.kind}`}
                  role="status"
                >
                  {feedback.text}
                </p>
              )}
            </div>
          )}
        </Panel>

        {/* Leadership actions (Líder / Administrador) */}
        {canManage && (
          <Panel title="Administração" variant="danger" code="ADM" className="auction-admin">
            {isFinished ? (
              <>
                <p className="auction-admin__hint">
                  Excluir apaga o leilão, os lances e o chat. Os pontos já debitados não mudam.
                </p>
                <Button variant="danger" onClick={() => setConfirm('delete')}>
                  Excluir leilão
                </Button>
              </>
            ) : (
              <>
                <p className="auction-admin__hint">
                  Encerrar termina o leilão sem vencedor: ninguém é cobrado e os pontos reservados
                  voltam na hora.
                </p>
                <Button variant="danger" onClick={() => setConfirm('cancel')}>
                  Encerrar leilão
                </Button>
              </>
            )}
          </Panel>
        )}

        <ConfirmDialog
          open={confirm === 'cancel'}
          title={`Encerrar leilão ${lotLabel}`}
          code="ADM"
          confirmLabel="Encerrar leilão"
          loading={cancelAuction.isPending}
          onConfirm={handleCancel}
          onCancel={closeConfirm}
        >
          <p>
            O leilão termina agora <strong>sem vencedor</strong> e ninguém é cobrado.
          </p>
          {reservedNames.length > 0 ? (
            <p className="confirm-dialog__note">
              {reservedNames.length > 1 ? 'Recebem' : 'Recebe'} de volta {auction.currentBid} pts
              reservados: <strong>{reservedNames.join(', ')}</strong>
            </p>
          ) : (
            <p className="confirm-dialog__note">Nenhum lance foi dado ainda.</p>
          )}
        </ConfirmDialog>

        <ConfirmDialog
          open={confirm === 'delete'}
          title={`Excluir leilão ${lotLabel}`}
          code="ADM"
          confirmLabel="Excluir leilão"
          loading={deleteAuction.isPending}
          onConfirm={handleDelete}
          onCancel={closeConfirm}
        >
          <p>
            <strong>{auction.items.map((i) => i.itemName).join(', ')}</strong> — o leilão, os lances e
            o chat serão apagados. Essa ação não pode ser desfeita.
          </p>
          <p className="confirm-dialog__note">
            Os pontos não são alterados
            {auction.winnerNickname
              ? `: ${auction.winnerNickname} continua debitado em ${auction.currentBid} pts.`
              : '.'}
          </p>
        </ConfirmDialog>
      </div>

      {/* ── RIGHT ───────────────────────────────────────────────────────────── */}
      <div className="auction-detail__right">
        <Panel title="Canal do leilão" code="COM" className="auction-chat" flush>
          <div className="auction-chat__messages">
            {messages.length === 0 && (
              <p className="auction-chat__empty">Nenhuma mensagem ainda.</p>
            )}
            {messages.map((msg) => {
              const isOwn = !!member && msg.member?.id === member.id
              const isBid = msg.type === 'BID'
              const isBot = msg.type === 'BOT'
              const isSystem = isBid || isBot
              const senderName = isSystem
                ? 'Sistema'
                : (isOwn ? undefined : msg.member?.nickname)

              return (
                <div
                  key={msg.id}
                  className={`auction-chat__bubble-wrap${!isSystem && isOwn ? ' auction-chat__bubble-wrap--own' : ''}`}
                >
                  <div
                    className={[
                      'auction-chat__bubble',
                      isSystem && isBid ? 'auction-chat__bubble--bid' : '',
                      isSystem && isBot ? 'auction-chat__bubble--bot' : '',
                      !isSystem && isOwn ? 'auction-chat__bubble--own' : '',
                      !isSystem && !isOwn ? 'auction-chat__bubble--other' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    {senderName && (
                      <span className={`auction-chat__nickname${isSystem ? ' auction-chat__nickname--system' : ''}`}>
                        {senderName}
                      </span>
                    )}
                    <span className="auction-chat__text">{msg.content}</span>
                    <span className="auction-chat__time">
                      {new Date(msg.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              )
            })}
            <div ref={chatEndRef} />
          </div>

          <form onSubmit={handleChat} className="auction-chat__form">
            <input
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              placeholder={isFinished ? 'Leilão encerrado' : 'Mensagem...'}
              className="auction-chat__input"
              disabled={isFinished}
            />
            <Button type="submit" size="sm" loading={sendMessage.isPending} disabled={isFinished}>
              Enviar
            </Button>
          </form>
        </Panel>
      </div>
    </div>
  )
}
