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
        <small>{unavailable || 'Até 3 chamadas: agora, em 2min30s e em 5min. Reaja com ✅ no Discord para confirmar.'}</small>
      </>}
      {call && <div role="status" aria-live="polite">
        <p>{call.sent}/3 chamadas enviadas · {call.confirmed.length} confirmaram
          {call.state === 'COMPLETE' && ' · encerrada'}
          {call.state === 'CANCELLED' && ' · cancelada'}
          {call.state === 'FAILED' && ' · interrompida'}
        </p>
        {call.confirmed.length > 0 && <p>✅ {call.confirmed.join(', ')}</p>}
        {call.pending.length > 0 && <p>Sem confirmação: {call.pending.join(', ')}</p>}
        {call.skipped.length > 0 && <p>Fora das chamadas (sem vínculo, inativos ou saíram da PT): {call.skipped.join(', ')}</p>}
        {call.error && <p>{call.error}</p>}
        {call.messageUrl && <a href={call.messageUrl} target="_blank" rel="noreferrer">Abrir chamada no Discord ↗</a>}
      </div>}
    </div>
  )
}
