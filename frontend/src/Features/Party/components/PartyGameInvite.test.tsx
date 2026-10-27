// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PartyGameInvite as Invite } from '@/Domain/Party/hooks/usePartyGameInvite'

const state: { data: Invite | null } = { data: null }
const mutate = vi.fn()
vi.mock('@/Domain/Party/hooks/usePartyGameInvite', () => ({
  usePartyGameInvite: () => ({ data: state.data }),
  useCallPartyInGame: () => ({ mutate, isPending: false }),
}))
vi.mock('@/Shared/ui/components/AppToast/AppToast', () => ({ useAppToast: () => ({ showToast: vi.fn() }) }))
const { PartyGameInvite } = await import('./PartyGameInvite')

const invite = (s: Invite['state']): Invite => ({
  partyId: 7, id: 'x', leader: 'Assassino', state: s, nicks: ['MiaL', 'Tofu'], skipped: ['Pend'],
  createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 120_000).toISOString(),
})
beforeEach(() => { state.data = null; mutate.mockReset() })
afterEach(cleanup)

describe('Party game invite', () => {
  it('lets the leader call everyone in game', () => {
    render(<PartyGameInvite partyId={7} canManage />)
    fireEvent.click(screen.getByRole('button', { name: 'Chamar todos no jogo' }))
    expect(mutate).toHaveBeenCalledOnce()
  })
  it('blocks repeated calls while the leader client is working and shows who is invited', () => {
    state.data = invite('WAITING')
    render(<PartyGameInvite partyId={7} canManage />)
    fireEvent.click(screen.getByRole('button'))
    expect(mutate).not.toHaveBeenCalled()
    expect(screen.getByText(/Assassino → MiaL, Tofu/)).toBeTruthy()
    expect(screen.getByText(/Fora do chamado: Pend/)).toBeTruthy()
  })
  it('allows a new call after completion or expiry', () => {
    state.data = invite('EXPIRED')
    render(<PartyGameInvite partyId={7} canManage />)
    expect(screen.getByText(/não respondeu a tempo/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Chamar todos no jogo' }))
    expect(mutate).toHaveBeenCalledOnce()
  })
  it('renders nothing for members who cannot manage the party', () => {
    render(<PartyGameInvite partyId={7} canManage={false} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
