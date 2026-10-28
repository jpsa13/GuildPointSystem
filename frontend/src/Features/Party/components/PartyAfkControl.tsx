import { usePartyAfk } from '@/Domain/Party/hooks/useParty'
import { useAppToast } from '@/Shared/ui/components/AppToast/AppToast'
import { Button } from '@/Shared/ui/components/Button/Button'
import { useServerNow } from '@/Shared/utils/useServerNow'
import { formatWaiting } from '../utils/partyWait'

function Countdown({ until }: { until: string }) {
  const now = useServerNow()
  return <span className="party-afk__timer" title="Tempo restante até ir para a fila">AFK · {formatWaiting(Date.parse(until) - now)}</span>
}

export function PartyAfkControl({ memberId, nickname, until, queued = false, canControl }: {
  memberId: number; nickname: string; until?: string | null; queued?: boolean; canControl: boolean
}) {
  const change = usePartyAfk()
  const { showToast } = useAppToast()
  const active = !!until || queued
  return <span className="party-afk" draggable={false} onDragStart={e => e.stopPropagation()}>
    {until && <Countdown until={until} />}
    {queued && <strong className="party-afk__tag">AFK</strong>}
    {canControl && <Button size="sm" variant="secondary" className="party-afk__button" loading={change.isPending}
      title={active ? 'Marcar que voltou. Retornar da fila não recoloca na PT.' : 'Avisar AFK e iniciar o limite de 15 minutos'}
      aria-label={active ? `Marcar retorno de ${nickname}` : `Iniciar AFK de 15 minutos para ${nickname}`}
      onClick={() => change.mutate({ memberId, active: !active }, {
        onError: error => showToast(error.message, 'error'),
      })}>{active ? 'Voltei' : 'AFK'}</Button>}
  </span>
}
