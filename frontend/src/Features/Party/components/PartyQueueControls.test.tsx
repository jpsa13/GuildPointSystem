import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PartyQueueControls } from './PartyQueueControls'
import { PartyLfgList } from './PartyLfgList'
import type { PartyLfgEntry } from '../Party.types'

const state = vi.hoisted(() => ({ priority: vi.fn(), unanswered: vi.fn(), toast: vi.fn(), pending: false }))
vi.mock('@/Domain/Party/hooks/useParty', () => ({
  usePartyQueuePriority: () => ({ mutate: state.priority, isPending: state.pending }),
  usePartyQueueUnanswered: () => ({ mutate: state.unanswered, isPending: false }),
}))
vi.mock('@/Shared/ui/components/AppToast/AppToast', () => ({ useAppToast: () => ({ showToast: state.toast }) }))
vi.mock('@/Shared/utils/useServerNow', () => ({ useServerNow: () => Date.parse('2026-10-28T12:00:00Z') }))
const entry: PartyLfgEntry = { memberId: 1, nickname: 'Player', className: null, classImageUrl: null,
  level: 50, expPercent: 12, note: null, createdAt: '2026-10-28T10:00:00Z', priorityPoints: 2, queueOrder: 3,
  lastUnansweredAt: '2026-10-28T11:00:00Z' }
beforeEach(() => { state.pending = false; state.priority.mockReset(); state.unanswered.mockReset(); state.toast.mockReset() })
afterEach(cleanup)

it('sends explicit +1/-1 and unanswered actions and reports failures', () => {
  render(<PartyQueueControls entry={entry} />)
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar 1 ponto de prioridade a Player' }))
  expect(state.priority.mock.calls[0][0]).toEqual({ memberId: 1, delta: 1 })
  fireEvent.click(screen.getByRole('button', { name: 'Remover 1 ponto de prioridade de Player' }))
  expect(state.priority.mock.calls[1][0]).toEqual({ memberId: 1, delta: -1 })
  fireEvent.click(screen.getByRole('button', { name: /Marcar Player/ }))
  expect(state.unanswered.mock.calls[0][0]).toBe(1)
  state.unanswered.mock.calls[0][1].onError(new Error('Sem permissão'))
  expect(state.toast).toHaveBeenCalledWith('Sem permissão', 'error')
})
it('prevents negative points and repeated actions while saving', () => {
  const view = render(<PartyQueueControls entry={{ ...entry, priorityPoints: 0 }} />)
  expect(screen.getByRole('button', { name: /Remover 1 ponto/ })).toBeDisabled()
  state.pending = true
  view.rerender(<PartyQueueControls entry={entry} />)
  screen.getAllByRole('button').forEach(button => expect(button).toBeDisabled())
})
it('shows points and unanswered marking publicly while retaining the original wait and no editing controls', () => {
  render(<PartyLfgList entries={[entry]} canDrag={false} />)
  expect(screen.getByText('2 pts')).toBeInTheDocument()
  expect(screen.getByText('Chamado, não respondeu')).toBeInTheDocument()
  expect(screen.getByText('2h 00m')).toBeInTheDocument()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
