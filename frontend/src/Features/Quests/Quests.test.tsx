import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QuestsPage } from './Quests'
const state = vi.hoisted(() => ({ events: [] as unknown[], refetch: vi.fn(), fetchNextPage: vi.fn(), query: vi.fn() }))
vi.mock('@/Features/Auth/contexts/AuthContext', () => ({ useAuthContext: () => ({ user: { nickname: 'Meu personagem' }, hasRole: () => false }) }))
vi.mock('@/Domain/Quest/hooks/useQuests', () => ({
  useQuests: (day: string, period: boolean) => { state.query(day, period); return ({ data: { pages: [{ events: state.events, sessions: [], simulationEnabled: false }] }, refetch: state.refetch, fetchNextPage: state.fetchNextPage }) },
  useQuestPairing: () => ({}), useQuestRevoke: () => ({}), useLiveQuestPairing: () => ({}), useQuestVisibility: () => ({}),
}))
afterEach(() => { cleanup(); state.events = [] })
describe('quest history', () => {
  it('explains missing coverage, approved reset and real ingestion restriction', () => {
    render(<QuestsPage />)
    expect(screen.getByRole('heading', { name: 'Checklist' })).toBeInTheDocument()
    expect(screen.getByText('Reset 03h · Brasília')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Histórico das observações' })).not.toBeVisible()
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-10-22' } })
    expect(state.query).toHaveBeenLastCalledWith('2026-10-22', true)
    fireEvent.click(screen.getByText('Histórico e conexão'))
    expect(screen.getByText(/Monitor real em validação local/)).toBeInTheDocument()
    expect(screen.getByText(/Nenhuma observação/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }))
    expect(state.refetch).toHaveBeenCalled()
  })
  it('labels removal indeterminate and distinguishes a simulated completion signal', () => {
    state.events = ['REMOVED_UNKNOWN', 'COMPLETION_SIGNAL'].map((status, i) => ({ sessionId: 'session', source: 'SIMULATION', monitorVersion: 'replay-0.1', receivedAt: '2026-10-23T23:01:00Z',
      event: { eventId: String(i), runId: 'run', sequence: i, state: status, title: 'Ore', code: 'Q071356', occurredAt: '2026-10-23T23:00:00Z', group: 1, type: 1, slot: 111, definitionHash: 'a', clientHash: 'b', edfHash: 'c' } }))
    render(<QuestsPage />)
    fireEvent.click(screen.getByText('Histórico e conexão'))
    expect(screen.getByText('Removida · causa indeterminada')).toBeInTheDocument()
    expect(screen.getByText('Sinal de conclusão detectado')).toBeInTheDocument()
    expect(screen.getByText(/Origens identificadas por ocorrência; nenhuma confirmação/)).toBeInTheDocument()
  })
})
