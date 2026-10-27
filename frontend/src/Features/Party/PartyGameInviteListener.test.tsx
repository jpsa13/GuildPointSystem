import { StrictMode } from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PartyGameInviteListener } from './PartyGameInviteListener'

const state = vi.hoisted(() => ({
  handlers: new Set<(message: { body: string }) => void>(), play: vi.fn(), toast: vi.fn(),
}))
vi.mock('@/Features/Auth/contexts/AuthContext', () => ({ useAuthContext: () => ({ user: { memberId: 7 } }) }))
vi.mock('@/Shared/ui/components/AppToast/AppToast', () => ({ useAppToast: () => ({ showToast: state.toast }) }))
vi.mock('@/Shared/utils/notificationSound', () => ({ playPartyInviteSound: state.play }))
vi.mock('@/Shared/websocket/socketClient', () => ({
  subscribeTopicEffect: (topic: string, handler: (message: { body: string }) => void) => {
    expect(topic).toBe('/topic/parties/member/7')
    state.handlers.add(handler)
    return () => state.handlers.delete(handler)
  },
}))

async function send(payload: unknown) {
  await act(async () => { state.handlers.forEach((h) => h({ body: JSON.stringify(payload) })) })
}
const invite = (inviteId: string) => ({ type: 'PARTY_GAME_INVITE', message: 'Lead te convidou para a PT no jogo.', partyId: 1, inviteId })

beforeEach(() => { localStorage.clear(); state.handlers.clear(); state.play.mockReset(); state.toast.mockReset() })
afterEach(cleanup)

describe('PartyGameInviteListener', () => {
  it('toca o som e avisa uma vez por chamado, mesmo com entregas repetidas', async () => {
    render(<StrictMode><PartyGameInviteListener /></StrictMode>)
    await send(invite('a'))
    await send(invite('a'))
    await send(invite('b'))
    expect(state.play).toHaveBeenCalledTimes(2)
    expect(state.toast).toHaveBeenCalledWith('Lead te convidou para a PT no jogo.', 'info')
  })

  it('não toca de novo em outra aba que recebe o mesmo chamado', async () => {
    localStorage.setItem('party-game-invite:a', String(Date.now()))
    render(<PartyGameInviteListener />)
    await send(invite('a'))
    expect(state.play).not.toHaveBeenCalled()
  })

  it('ignora outros avisos da PT', async () => {
    render(<PartyGameInviteListener />)
    await send({ type: 'KICKED_FROM_PARTY', message: 'x', partyId: 1 })
    expect(state.play).not.toHaveBeenCalled()
  })
})
