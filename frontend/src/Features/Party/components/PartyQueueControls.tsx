import { usePartyQueuePriority, usePartyQueueUnanswered } from '@/Domain/Party/hooks/useParty'
import { useAppToast } from '@/Shared/ui/components/AppToast/AppToast'
import { Button } from '@/Shared/ui/components/Button/Button'
import type { PartyLfgEntry } from '../Party.types'

export function PartyQueueControls({ entry }: { entry: PartyLfgEntry }) {
  const priority = usePartyQueuePriority()
  const unanswered = usePartyQueueUnanswered()
  const { showToast } = useAppToast()
  const pending = priority.isPending || unanswered.isPending
  const onError = (error: Error) => showToast(error.message, 'error')
  return <div className="party-queue-controls">
    <Button size="sm" variant="secondary" disabled={pending || (entry.priorityPoints ?? 0) <= 0}
      aria-label={`Remover 1 ponto de prioridade de ${entry.nickname}`}
      onClick={() => priority.mutate({ memberId: entry.memberId, delta: -1 }, { onError })} title={`Remover 1 ponto de prioridade de ${entry.nickname}`}>−</Button>
    <Button size="sm" variant="secondary" disabled={pending}
      aria-label={`Adicionar 1 ponto de prioridade a ${entry.nickname}`}
      onClick={() => priority.mutate({ memberId: entry.memberId, delta: 1 }, { onError })} title={`Adicionar 1 ponto de prioridade a ${entry.nickname}`}>+</Button>
    <Button size="sm" variant="secondary" disabled={pending}
      title="Chamado, não respondeu: final da fila entre players com a mesma pontuação, preservando o tempo de espera"
      aria-label={`Marcar ${entry.nickname} como chamado sem resposta e mover ao final da fila`}
      onClick={() => unanswered.mutate(entry.memberId, { onError })}>
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 4v11m-4-4 4 4 4-4M5 20h14" />
      </svg>
    </Button>
  </div>
}
