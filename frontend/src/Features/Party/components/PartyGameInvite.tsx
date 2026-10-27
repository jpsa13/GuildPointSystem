import { useCallPartyInGame, usePartyGameInvite } from '@/Domain/Party/hooks/usePartyGameInvite'
import { useAppToast } from '@/Shared/ui/components/AppToast/AppToast'
import { Button } from '@/Shared/ui/components/Button/Button'

const STATUS: Record<string, string> = {
  WAITING: 'Aguardando o jogo do líder (ele precisa estar online com a DLL).',
  DELIVERED: 'Convites sendo enviados no jogo…',
  COMPLETE: 'Convites enviados no jogo.',
  EXPIRED: 'O jogo do líder não respondeu a tempo.',
}

export function PartyGameInvite({ partyId, canManage }: { partyId: number; canManage: boolean }) {
  const { showToast } = useAppToast()
  const invite = usePartyGameInvite(partyId, canManage)
  const call = useCallPartyInGame(partyId)
  if (!canManage) return null
  const current = invite.data
  const busy = current?.state === 'WAITING' || current?.state === 'DELIVERED'
  const onCall = () => call.mutate(undefined, {
    onError: (error) => showToast(error instanceof Error ? error.message : 'Não foi possível chamar a PT no jogo.', 'error'),
  })
  return (
    <div className="party-discord party-game-invite">
      <Button size="sm" variant="secondary" loading={call.isPending} disabled={busy} onClick={onCall}>
        {busy ? 'Chamado no jogo em andamento' : 'Chamar todos no jogo'}
      </Button>
      {current && <small>{STATUS[current.state]} {current.state !== 'EXPIRED' && `${current.leader} → ${current.nicks.join(', ')}`}
        {current.skipped.length > 0 && ` · Fora do chamado: ${current.skipped.join(', ')}`}</small>}
    </div>
  )
}
