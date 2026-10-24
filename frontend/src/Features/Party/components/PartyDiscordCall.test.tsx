// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PartyDiscordCall } from './PartyDiscordCall'
import type { PartyDiscordCall as Call } from '@/Domain/Party/hooks/usePartyDiscord'

afterEach(() => { cleanup(); vi.useRealTimers() })
const call: Call = {
  partyId: 7, runId: 'test', state: 'WAITING', sent: 1,
  confirmed: ['Alice'], pending: ['Bob'], skipped: ['Charlie'],
  nextAt: null, endsAt: new Date(Date.now() + 300_000).toISOString(),
  messageUrl: 'https://discord.com/channels/1/2/3', error: null,
}

describe('Party Discord calls', () => {
  it('calls only through the enabled leader button', () => {
    const onCall = vi.fn()
    render(<PartyDiscordCall canManage loading={false} onCall={onCall} />)
    fireEvent.click(screen.getByRole('button', { name: 'Chamar PT no Discord' }))
    expect(onCall).toHaveBeenCalledOnce()
  })
  it('explains configuration failures and blocks sending', () => {
    const onCall = vi.fn()
    render(<PartyDiscordCall canManage loading={false} unavailable="Configure o bot" onCall={onCall} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onCall).not.toHaveBeenCalled()
    expect(screen.getByText('Configure o bot')).toBeTruthy()
  })
  it('shows confirmations and prevents overlapping rounds', () => {
    const onCall = vi.fn()
    render(<PartyDiscordCall call={call} canManage loading={false} onCall={onCall} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onCall).not.toHaveBeenCalled()
    expect(screen.getByText('✅ Alice')).toBeTruthy()
    expect(screen.getByText('Sem confirmação: Bob')).toBeTruthy()
    expect(screen.getByRole('link').getAttribute('href')).toBe(call.messageUrl)
  })
  it('does not offer nonleaders a call button', () => {
    render(<PartyDiscordCall call={call} canManage={false} loading={false} onCall={vi.fn()} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
  it('enables a new round after five minutes even if everyone confirmed early', () => {
    vi.useFakeTimers()
    const onCall = vi.fn()
    const completed = { ...call, state: 'COMPLETE' as const, endsAt: new Date(Date.now() + 2000).toISOString() }
    render(<PartyDiscordCall call={completed} canManage loading={false} onCall={onCall} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onCall).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(3000))
    fireEvent.click(screen.getByRole('button', { name: 'Chamar PT no Discord' }))
    expect(onCall).toHaveBeenCalledOnce()
  })
})
