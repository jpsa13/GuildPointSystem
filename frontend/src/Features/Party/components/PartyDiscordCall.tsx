import type { PartyDiscordCall as Call } from '@/Domain/Party/hooks/usePartyDiscord'
import { Button } from '@/Shared/ui/components/Button/Button'
import { useServerNow } from '@/Shared/utils/useServerNow'

export function PartyDiscordCall({ call, canManage, unavailable, loading, onCall }: {
  call?: Call
  canManage: boolean
  unavailable?: string | null
  loading: boolean
  onCall: () => void
}) {
  const now = useServerNow()
  const active = call?.state === 'WAITING' || call?.state === 'SENDING'
  const cooldown = !!call && now < Date.parse(call.endsAt)
  return (
    <div className="party-discord">
      {canManage && <>
        <Button size="sm" variant="secondary" loading={loading}
          disabled={!!unavailable || active || cooldown} onClick={onCall}>
          {active ? 'Chamada em andamento' : cooldown ? 'Aguarde esta rodada terminar' : 'Chamar PT no Discord'}
        </Button>
        {unavailable && <small>{unavailable}</small>}
      </>}
    </div>
  )
}
