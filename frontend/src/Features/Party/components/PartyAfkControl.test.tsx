import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PartyAfkControl } from './PartyAfkControl'

const state = vi.hoisted(() => ({ mutate: vi.fn(), toast: vi.fn(), pending: false, now: Date.parse('2026-10-28T12:00:00Z') }))
vi.mock('@/Domain/Party/hooks/useParty', () => ({ usePartyAfk: () => ({ mutate: state.mutate, isPending: state.pending }) }))
vi.mock('@/Shared/ui/components/AppToast/AppToast', () => ({ useAppToast: () => ({ showToast: state.toast }) }))
vi.mock('@/Shared/utils/useServerNow', () => ({ useServerNow: () => state.now }))
beforeEach(() => { state.mutate.mockReset(); state.toast.mockReset(); state.pending = false; state.now = Date.parse('2026-10-28T12:00:00Z') })
afterEach(cleanup)

it('starts a 15 minute notice, counts down on server time and lets the player return', () => {
  const view = render(<PartyAfkControl memberId={1} nickname="Player" canControl />)
  fireEvent.click(screen.getByRole('button', { name: 'Iniciar AFK de 15 minutos para Player' }))
  expect(state.mutate.mock.calls[0][0]).toEqual({ memberId: 1, active: true })
  view.rerender(<PartyAfkControl memberId={1} nickname="Player" until="2026-10-28T12:15:00Z" canControl />)
  expect(screen.getByText('AFK · 15:00')).toBeInTheDocument()
  state.now += 60_000
  view.rerender(<PartyAfkControl memberId={1} nickname="Player" until="2026-10-28T12:15:00Z" canControl />)
  expect(screen.getByText('AFK · 14:00')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Marcar retorno de Player' }))
  expect(state.mutate.mock.calls[1][0]).toEqual({ memberId: 1, active: false })
})
it('shows countdown read-only to other players and clamps expired display at zero', () => {
  render(<PartyAfkControl memberId={1} nickname="Player" until="2026-10-28T11:59:00Z" canControl={false} />)
  expect(screen.getByText('AFK · 0:00')).toBeInTheDocument()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
it('shows the queued AFK tag, disables repeated actions and reports failed saves', () => {
  const view = render(<PartyAfkControl memberId={1} nickname="Player" queued canControl />)
  expect(screen.getByText('AFK')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Marcar retorno de Player' }))
  expect(state.mutate.mock.calls[0][0]).toEqual({ memberId: 1, active: false })
  state.mutate.mock.calls[0][1].onError(new Error('Falha ao salvar'))
  expect(state.toast).toHaveBeenCalledWith('Falha ao salvar', 'error')
  state.pending = true
  view.rerender(<PartyAfkControl memberId={1} nickname="Player" queued canControl />)
  expect(screen.getByRole('button')).toBeDisabled()
})
