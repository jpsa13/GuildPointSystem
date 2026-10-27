import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { EquipmentRelics } from './EquipmentRelics'
import groups from '@/Domain/Equipment/relics.json'

const state = vi.hoisted(() => ({ active: [] as number[], loading: false, error: null as Error | null, pending: false, failed: false, mutate: vi.fn() }))
vi.mock('@/Domain/Equipment/hooks/useEquipment', () => ({
  useEquipmentRelics: () => ({ data: state.active, isLoading: state.loading, error: state.error, refetch: vi.fn() }),
  useEquipmentRelicChange: () => ({ mutate: state.mutate, isPending: state.pending, error: state.failed ? new Error('Falha') : null }),
}))
beforeEach(() => { state.active = []; state.loading = false; state.error = null; state.pending = false; state.failed = false; state.mutate.mockReset() })
afterEach(cleanup)

it('preserves all 120 original positions and the marketplace grade order', () => {
  expect(groups.map(g => g.grade)).toEqual([1, 2, 3, 6, 4, 5, 7, 8])
  expect(groups.flatMap(g => g.items.map(i => i.id)).sort((a, b) => a - b)).toEqual(Array.from({ length: 120 }, (_, i) => i))
  render(<EquipmentRelics memberId={1} editable />)
  expect(screen.getAllByRole('button')).toHaveLength(120)
  expect(within(screen.getByRole('region', { name: 'Grade 1' })).getAllByRole('button')).toHaveLength(16)
})
it('activates and deactivates using saved state instead of changing the visual before saving', () => {
  const view = render(<EquipmentRelics memberId={1} editable />)
  const first = screen.getByRole('button', { name: 'Relic 1 · Grade 1' })
  expect(first).toHaveAttribute('aria-pressed', 'false')
  fireEvent.click(first)
  expect(state.mutate).toHaveBeenCalledWith({ relicId: 0, active: true })
  expect(first).not.toHaveClass('is-active')
  state.active = [0]; view.rerender(<EquipmentRelics memberId={1} editable />)
  expect(first).toHaveClass('is-active')
  expect(first).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(first)
  expect(state.mutate).toHaveBeenLastCalledWith({ relicId: 0, active: false })
})
it('shows other players relics without permitting changes', () => {
  state.active = [0]
  render(<EquipmentRelics memberId={2} editable={false} />)
  const first = screen.getByRole('button', { name: 'Relic 1 · Grade 1' })
  expect(first).toHaveClass('is-active')
  expect(screen.getAllByRole('button').every(b => (b as HTMLButtonElement).disabled)).toBe(true)
  fireEvent.click(first); expect(state.mutate).not.toHaveBeenCalled()
})
it('disables edits while loading or saving and retains the saved visual after an error', () => {
  state.pending = true
  const view = render(<EquipmentRelics memberId={1} editable />)
  expect(screen.getAllByRole('button').every(b => (b as HTMLButtonElement).disabled)).toBe(true)
  state.pending = false; state.failed = true
  view.rerender(<EquipmentRelics memberId={1} editable />)
  expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível salvar')
  expect(screen.getByRole('button', { name: 'Relic 1 · Grade 1' })).toHaveAttribute('aria-pressed', 'false')
  state.failed = false; state.error = new Error('Falha de leitura')
  view.rerender(<EquipmentRelics memberId={1} editable />)
  expect(screen.getByRole('button', { name: 'Relic 1 · Grade 1' })).toBeDisabled()
})
