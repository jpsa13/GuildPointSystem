import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RotationPage } from './Rotation'
import { rotationTime, rotationTotals } from './Rotation.utils'
import type { Rotation } from '@/Domain/Rotation/hooks/useRotation'
const state = vi.hoisted(() => ({ admin: false, save: vi.fn(), data: null as Rotation | null }))
vi.mock('@/Features/Auth/contexts/AuthContext', () => ({ useAuthContext: () => ({ hasRole: () => state.admin }) }))
vi.mock('@/Domain/Rotation/hooks/useRotation', async importOriginal => ({
  ...await importOriginal<object>(),
  useRotation: () => ({ data: state.data, isPending: false }),
  useSaveRotation: () => ({ mutate: state.save, isPending: false }),
}))
afterEach(() => { cleanup(); state.admin = false; state.save.mockClear() })
const fixture: Rotation = { version: 3, updatedAt: '2026-10-26T22:00:00Z', slots: [
  { time: '18:00', qg: [{ guild: 'Quit', bosses: ['Warbeast', 'Splinter'] }], outpost: [{ guild: 'Energy', bosses: ['Great Lava'] }] },
] }
describe('Rotação', () => {
  it('handles next day and derives totals from assignments', () => {
    expect(rotationTime('18:00', 6)).toBe('00:00 +1')
    expect(rotationTime('22:30', 10)).toBe('08:30 +1')
    expect(rotationTotals(fixture.slots, 'Quit')).toEqual({ qg: 2, outpost: 0 })
  })
  it('shows the agenda, filters by guild and keeps editing unavailable to members', () => {
    state.data = fixture
    render(<RotationPage />)
    expect(screen.getByText('Warbeast / Splinter')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar rotação' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Filtrar guilda'), { target: { value: 'Quit' } })
    expect(screen.queryByText('Great Lava')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'EXP' }))
    expect(screen.getByText('A rotação de EXP ainda não foi publicada.')).toBeInTheDocument()
  })
  it('edits a draft without changing the published data and submits its original version', () => {
    state.data = fixture; state.admin = true
    render(<RotationPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Editar rotação' }))
    fireEvent.change(screen.getByLabelText('Horário 1'), { target: { value: '19:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar rotação' }))
    expect(state.save.mock.calls[0][0].version).toBe(3)
    expect(state.save.mock.calls[0][0].slots[0].time).toBe('19:00')
    expect(fixture.slots[0].time).toBe('18:00')
  })
})
