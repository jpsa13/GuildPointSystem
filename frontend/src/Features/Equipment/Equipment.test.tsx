import { act, fireEvent, render as rawRender, screen, waitFor, cleanup, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EquipmentPage } from './Equipment'
import { EQUIPMENT_GROUPS, type CatalogFilters, type EquipmentAssignment, type EquipmentSlot } from '@/Domain/Equipment/types'
import sheets from '@/Domain/Equipment/icon-sheets.json'
import { EquipmentIcon } from './EquipmentIcon'
vi.mock('./EquipmentRelics', () => ({ EquipmentRelics: ({ editable }: { editable: boolean }) => <section aria-label="Relics" data-editable={String(editable)} /> }))

const state = vi.hoisted(() => ({ admin: true, userId: 2, className: '', profileLoading: false, profileError: null as Error | null, profileQuery: vi.fn(), multiEffects: false, current: false, currentSlot: 'Weapon' as EquipmentSlot, currentLevel: 25, currentGrade: 0, extraMember: false, transferTarget: false, targetEmpty: false, catalogGrade: 1, catalogTotal: 1, effectsNote: '', history: [] as EquipmentAssignment[], reviewAction: vi.fn(), reviews: [] as import('@/Domain/Equipment/types').EquipmentReview[], slotEdit: vi.fn(), mutate: vi.fn(), refetch: vi.fn(), catalog: vi.fn(), historyQuery: vi.fn() }))
const effect = { key: '15:0.08', code: 15, name: 'Force Attack', displayType: 'FLAT' as const, value: 0.08, unitHint: 'percent_0_1' }
const record: EquipmentAssignment = { id: 20, memberId: 1, slot: 'Weapon', catalogId: 7, category: 'WEAPON', gameCode: 'iwsta25', name: 'Field Staff', level: 25, grade: 0, effect, origin: 'GUILD_DISTRIBUTION', occurredOn: '2026-10-21', createdAt: '2026-10-21T10:00:00Z', actorId: 2, actorName: 'Admin local', status: 'ACTIVE', correctsId: null, reason: null }
vi.mock('@/Domain/Member/hooks/useMembers', () => ({ useMember: (id: number) => {
  state.profileQuery(id)
  return { data: { className: state.className }, isLoading: state.profileLoading, error: state.profileError, refetch: vi.fn() }
} }))
vi.mock('@/Features/Auth/contexts/AuthContext', () => ({ useAuthContext: () => ({ hasRole: () => state.admin, user: { memberId: state.userId, nickname: 'Admin local' } }) }))
vi.mock('@/Shared/ui/components/AppToast/AppToast', () => ({ useAppToast: () => ({ showToast: vi.fn() }) }))
vi.mock('@/Domain/Equipment/hooks/useEquipment', () => ({
  useEquipmentReviews: () => ({ data: state.reviews }),
  useEquipmentReviewAction: () => ({ mutate: state.reviewAction, isPending: false }),
  useEquipment: () => ({ data: [{ memberId: 1, nickname: 'Player local', level: 50, expPercent: 12.5, classId: 1, className: 'Warrior', classImageUrl: '/classes/warrior.png', gearScore: { total: 1000, weapon: 1000, armor: 0, accessories: 0, unscored: 0 }, slots: EQUIPMENT_GROUPS.flatMap(g => g.slots).map(slot => ({ slot, version: state.current && slot === state.currentSlot ? 1 : 0, assignment: state.current && slot === state.currentSlot ? { ...record, slot, level: state.currentLevel, grade: state.currentGrade } : null })) }, ...(state.transferTarget ? [{ memberId: 3, nickname: 'Destinatário local', level: 40, expPercent: 0, classId: 2, className: 'Spiritualist', gearScore: { total: 2500, weapon: 1000, armor: 1500, accessories: 0, unscored: 0 }, slots: EQUIPMENT_GROUPS.flatMap(g => g.slots).map(slot => ({ slot, version: state.targetEmpty ? 0 : 2, assignment: state.targetEmpty ? null : { ...record, id: 30, memberId: 3, slot, name: 'Item do destinatário' } })) }] : []), ...(state.extraMember ? [{ memberId: 4, nickname: 'Outro player', level: 50, slots: [] }] : [])], refetch: state.refetch }),
  useEquipmentImportStatus: () => ({ data: { imported_count: 100, excluded: '[]' } }),
  useEquipmentHistory: (id: number, enabled = true) => { state.historyQuery(id, enabled); return { data: enabled && id > 0 ? state.history : [], refetch: state.refetch } },
  useEquipmentCatalog: (category: string, search: string, page: number, enabled: boolean, filters: CatalogFilters) => {
    state.catalog(category, search, page, enabled, filters)
    return { data: { items: [{ id: 7, category, gameCode: 'iwstb25', name: 'Intense Staff', level: 50, grade: state.catalogGrade, effects: state.multiEffects ? [effect, { ...effect, key: '15:0.1', value: 0.1 }] : [effect], effectsNote: state.effectsNote }], total: state.catalogTotal, abilities: ['Fine', 'Solid', 'Guardian'], weaponTypes: filters.equipmentClass === 'FORCE' ? [9] : filters.equipmentClass === 'RANGER' ? [5, 6, 8] : filters.equipmentClass === 'MELEE' ? [0, 1, 2, 3, 4] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11], size: 30, page: 0 } }
  },
  useEquipmentSlotEdit: () => ({ mutateAsync: state.slotEdit, isPending: false }),
  useEquipmentOperation: () => ({ mutateAsync: state.mutate, isPending: false }),
}))
beforeEach(() => { state.className = ''; state.profileLoading = false; state.profileError = null; state.profileQuery.mockClear(); state.reviews = []; state.reviewAction.mockReset(); state.admin = true; state.userId = 2; state.historyQuery.mockClear(); state.multiEffects = false; state.current = false; state.currentSlot = 'Weapon'; state.currentLevel = 25; state.currentGrade = 0; state.extraMember = false; state.transferTarget = false; state.targetEmpty = false; state.catalogGrade = 1; state.catalogTotal = 1; state.effectsNote = ''; state.history = []; state.slotEdit.mockReset(); state.slotEdit.mockImplementation(async (request) => ({ operationId: request.operationId, memberId: request.memberId, slots: request.slots.map((s: { slot: EquipmentSlot; expectedVersion: number }) => ({ slot: s.slot, version: s.expectedVersion + 1, assignment: null })) })); state.mutate.mockReset(); state.mutate.mockResolvedValue(record); state.catalog.mockClear() })
afterEach(cleanup)
function render(element: React.ReactElement) { const result = rawRender(element); if (state.admin && element.type === EquipmentPage) fireEvent.click(screen.getByRole('button', { name: 'Gerenciar players' })); return result }
function inspect() { if (!state.admin) return; fireEvent.click(screen.getByRole('button', { name: 'Player local' })) }
function openEditor(slot = 'Weapon') {
  inspect()
  if (slot === 'Weapon2') fireEvent.click(within(screen.getByRole('group', { name: 'Inventário de Player local' })).getByRole('button', { name: /^Arma à direita:/ }))
  if (slot === 'Cloak') fireEvent.click(within(screen.getByRole('group', { name: 'Inventário de Player local' })).getByRole('button', { name: /^Cloak:/ }))
  if (slot === 'Ring1') fireEvent.click(within(screen.getByRole('group', { name: 'Inventário de Player local' })).getByRole('button', { name: /^Anel à esquerda:/ }))
  if (slot === 'Helmet') fireEvent.click(within(screen.getByRole('group', { name: 'Inventário de Player local' })).getByRole('button', { name: /^Helmet:/ }))
  if (slot === 'Weapon') fireEvent.click(within(screen.getByRole('group', { name: 'Inventário de Player local' })).getByRole('button', { name: /^Arma à esquerda:/ }))
}
function selectItem() { fireEvent.click(screen.getByRole('button', { name: 'Selecionar Intense Staff · iwstb25' })) }

describe('Equipamentos', () => {
  it.each([true, false])('restricts relic editing to admins even on their own inventory (admin=%s)', admin => {
    state.admin = admin; state.userId = 1
    render(<EquipmentPage />); inspect()
    expect(screen.getByRole('region', { name: 'Relics' })).toHaveAttribute('data-editable', String(admin))
  })
  it('opens a delivery directly from the recipient row without editing equipment', async () => {
    state.transferTarget = true; state.targetEmpty = true
    render(<EquipmentPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Registrar entrega para Destinatário local' }))
    expect(screen.getByRole('form', { name: 'Registrar entrega de item' })).toBeInTheDocument()
    expect(state.historyQuery).toHaveBeenLastCalledWith(3, true)
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Quantidade' }), { target: { value: '2' } })
    selectItem()
    await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(1))
    expect(state.mutate.mock.calls[0][0]).toMatchObject({ memberId: 3, quantity: 2, useAsCurrent: false })
    expect(state.slotEdit).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Itens entregues' })).toHaveAttribute('aria-selected', 'true'))
  })
  it.each([true, false])('shows progress and class and combines class filtering with sorting and search (admin=%s)', admin => {
    state.admin = admin; state.userId = 1; state.transferTarget = true; state.extraMember = true
    render(<EquipmentPage />)
    if (!admin) fireEvent.click(screen.getByRole('button', { name: 'Ver jogadores' }))
    const roster = screen.getByRole('list', { name: 'Equipamentos dos personagens' })
    const names = () => within(roster).getAllByRole('button', { name: /^(Player local|Destinatário local|Outro player)$/ }).map(b => b.textContent)
    expect(within(roster).getByText('Lv. 50 · 12,50% XP')).toBeInTheDocument()
    expect(within(roster).getByText('Lv. 40 · 0,00% XP')).toBeInTheDocument()
    expect(within(roster).getByText('1.000 GS')).toBeInTheDocument()
    expect(within(roster).getByLabelText('Warrior').querySelector('img')).toHaveAttribute('src', '/classes/warrior.png')
    expect(within(roster).getByText(/EXP não informada/)).toBeInTheDocument()
    expect(screen.getByLabelText('Ordenar jogadores')).toHaveValue('gs-desc')
    expect(names()).toEqual(['Destinatário local', 'Player local', 'Outro player'])
    fireEvent.change(screen.getByLabelText('Ordenar jogadores'), { target: { value: 'level-desc' } })
    expect(names()).toEqual(['Outro player', 'Player local', 'Destinatário local'])
    fireEvent.change(screen.getByLabelText('Ordenar jogadores'), { target: { value: 'level-asc' } })
    expect(names()).toEqual(['Destinatário local', 'Outro player', 'Player local'])
    const classes = screen.getByRole('group', { name: 'Classe do personagem' })
    expect(within(classes).getAllByRole('button')).toHaveLength(3)
    fireEvent.click(within(classes).getByRole('button', { name: 'MELEE' }))
    expect(within(classes).getByRole('button', { name: 'MELEE' })).toHaveAttribute('aria-pressed', 'true')
    expect(names()).toEqual(['Player local'])
    fireEvent.change(screen.getByLabelText('Pesquisar personagem'), { target: { value: 'Destinatário' } })
    expect(screen.getByText('Nenhum personagem encontrado com esses filtros.')).toBeInTheDocument()
    fireEvent.click(within(classes).getByRole('button', { name: 'FORCE' }))
    expect(names()).toEqual(['Destinatário local'])
    fireEvent.change(screen.getByLabelText('Pesquisar personagem'), { target: { value: '' } })
    fireEvent.click(within(classes).getByRole('button', { name: 'FORCE' }))
    expect(names()).toEqual(['Destinatário local', 'Outro player', 'Player local'])
    fireEvent.click(within(classes).getByRole('button', { name: 'RANGER' }))
    expect(screen.getByText('Nenhum personagem encontrado com esses filtros.')).toBeInTheDocument()
    expect(state.mutate).not.toHaveBeenCalled()
    expect(state.slotEdit).not.toHaveBeenCalled()
  })
  it.each([true, false])('defaults weapon class and clears the type when switching class (admin=%s)', admin => {
    state.admin = admin; state.userId = 1; state.className = 'Warlock'
    render(<EquipmentPage />); openEditor()
    expect(screen.getByRole('button', { name: 'Force' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Cajado' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Espada' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cajado' }))
    expect(state.catalog.mock.lastCall?.[4]).toMatchObject({ equipmentClass: 'FORCE', weaponType: 9 })
    fireEvent.click(screen.getByRole('button', { name: 'Melee' }))
    expect(state.catalog.mock.lastCall?.[4]).toMatchObject({ equipmentClass: 'MELEE', weaponType: undefined })
    expect(screen.queryByRole('button', { name: 'Cajado' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Espada' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Espada' }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Tipo de arma' })).getByRole('button', { name: 'Todos' }))
    expect(state.catalog.mock.lastCall?.[4]).toMatchObject({ equipmentClass: 'MELEE', weaponType: undefined })
  })
  it('filters accessories by effect and lets the selected race constrain the results', () => {
    render(<EquipmentPage />); openEditor('Ring1')
    expect(screen.getByLabelText('Raça do equipamento')).toBeEnabled()
    fireEvent.change(screen.getByLabelText('Raça do equipamento'), { target: { value: 'ACCRETIA' } })
    for (const [label, accessoryEffect] of [['Ataque', 'ATTACK'], ['Esquiva', 'DODGE'], ['Defesa', 'DEFENSE']]) {
      fireEvent.click(screen.getByRole('button', { name: label }))
      expect(state.catalog.mock.lastCall?.[4]).toMatchObject({ race: 'ACCRETIA', accessoryEffect })
    }
    fireEvent.click(within(screen.getByRole('group', { name: 'Tipo de acessório' })).getByRole('button', { name: 'Todos' }))
    expect(state.catalog.mock.lastCall?.[4]).toMatchObject({ race: 'ACCRETIA', accessoryEffect: undefined })
  })
  it.each([['Warrior', 'Melee', 'MELEE'], ['Adventurer', 'Ranger', 'RANGER'], ['Warlock', 'Force', 'FORCE']])('defaults armor to the inspected character class %s', (className, label, equipmentClass) => {
    state.className = className
    render(<EquipmentPage />); openEditor('Helmet')
    expect(state.profileQuery).toHaveBeenLastCalledWith(1)
    expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true')
    expect(state.catalog).toHaveBeenLastCalledWith('HELMET', '', 0, true, { race: 'CORA', grade: 3, equipmentClass })
    fireEvent.click(screen.getByRole('button', { name: 'Todas as classes' }))
    expect(screen.getByRole('button', { name: 'Todas as classes' })).toHaveAttribute('aria-pressed', 'true')
  })
  it('waits for the character class before showing armor options', () => {
    state.profileLoading = true
    render(<EquipmentPage />); openEditor('Helmet')
    expect(screen.getByRole('status')).toHaveTextContent('Carregando classe')
    expect(state.catalog).not.toHaveBeenCalled()
  })
  it('keeps unknown classes and weapons without an automatic armor filter', () => {
    state.className = 'Artist'
    render(<EquipmentPage />); openEditor('Helmet')
    expect(screen.getByRole('button', { name: 'Todas as classes' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(screen.getByRole('group', { name: 'Inventário de Player local' })).getByRole('button', { name: /^Arma à esquerda:/ }))
    expect(state.profileQuery).toHaveBeenLastCalledWith(1)
    expect(state.catalog).toHaveBeenLastCalledWith('WEAPON', '', 0, true, { race: 'CORA', grade: 3, level: 45 })
  })

  it('removes one item without opening its editor, then supports keyboard undo and redo', async () => {
    state.current = true
    render(<EquipmentPage />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Remover Arma à esquerda de Player local' })) })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Desfazer' })).toBeEnabled())
    expect(state.slotEdit.mock.calls[0][0]).toMatchObject({ memberId: 1, slots: [{ slot: 'Weapon', expectedVersion: 1 }] })
    expect(screen.queryByRole('heading', { name: 'Registrar equipamento · Arma' })).not.toBeInTheDocument()
    const removed = state.slotEdit.mock.calls[0][0]
    await act(async () => { fireEvent.keyDown(window, { key: 'z', ctrlKey: true }) })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refazer' })).toBeEnabled())
    expect(state.slotEdit.mock.calls[1][0]).toMatchObject({ reversesOperationId: removed.operationId, slots: [{ slot: 'Weapon', expectedVersion: 2 }] })
    await act(async () => { fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true }) })
    await waitFor(() => expect(state.slotEdit).toHaveBeenCalledTimes(3))
    expect(state.slotEdit.mock.calls[2][0]).toMatchObject({ reversesOperationId: state.slotEdit.mock.calls[1][0].operationId, slots: [{ slot: 'Weapon', expectedVersion: 3 }] })
  })
  it('clears all twelve positions in one request and undoes them as one action', async () => {
    state.transferTarget = true
    render(<EquipmentPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Limpar equipamentos de Destinatário local' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Desfazer' })).toBeEnabled())
    expect(state.slotEdit).toHaveBeenCalledTimes(1)
    expect(state.slotEdit.mock.calls[0][0].slots).toHaveLength(12)
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(state.slotEdit).toHaveBeenCalledTimes(2))
    expect(state.slotEdit.mock.calls[1][0].slots).toHaveLength(12)
    expect(state.slotEdit.mock.calls[1][0].reversesOperationId).toBe(state.slotEdit.mock.calls[0][0].operationId)
  })
  it('opens the owner inventory, hides management and supports undo', async () => {
    state.admin = false; state.userId = 1; state.current = true; state.transferTarget = true
    render(<EquipmentPage />)
    expect(screen.queryByRole('button', { name: 'Gerenciar players' })).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Equipamentos dos personagens' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remover Arma à esquerda' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Desfazer' })).toBeEnabled())
    const input = document.createElement('input'); document.body.append(input)
    fireEvent.keyDown(input, { key: 'z', ctrlKey: true }); input.remove()
    expect(state.slotEdit).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    await waitFor(() => expect(state.slotEdit).toHaveBeenCalledTimes(2))
  })
  it('starts administrators in their own inventory and offers management separately', () => {
    state.userId = 1
    rawRender(<EquipmentPage />)
    expect(screen.getByRole('group', { name: 'Inventário de Player local' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Equipamentos dos personagens' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Gerenciar players' }))
    expect(screen.getByRole('list', { name: 'Equipamentos dos personagens' })).toBeInTheDocument()
  })
  it('requests a review and lets the owner explicitly confirm it', () => {
    render(<EquipmentPage />)
    inspect()
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar revisão · 72h' }))
    expect(state.reviewAction).toHaveBeenCalledWith({ memberId: 1, operationId: expect.any(String) })
    cleanup(); state.admin = false; state.userId = 1
    state.reviews = [{ id: 'review-id', memberId: 1, requestedAt: '2026-10-22T12:00:00Z', dueAt: '2026-10-25T12:00:00Z', confirmedAt: null, status: 'PENDING', overdue: false }]
    render(<EquipmentPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Revisei meus equipamentos' }))
    expect(state.reviewAction).toHaveBeenLastCalledWith({ confirmId: 'review-id' })
  })
  it('retries a failed removal with the same identifier and adds history only after success', async () => {
    state.current = true; state.slotEdit.mockRejectedValueOnce(new Error('Resposta perdida'))
    render(<EquipmentPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Remover Arma à esquerda de Player local' }))
    await screen.findByRole('button', { name: 'Tentar novamente' })
    expect(screen.getByRole('button', { name: 'Desfazer' })).toBeDisabled()
    const first = state.slotEdit.mock.calls[0][0]
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Desfazer' })).toBeEnabled())
    expect(state.slotEdit.mock.calls[1][0]).toEqual(first)
  })
  it('shows an equipment tooltip with icon, model, level, grade and effect on hover or keyboard focus', () => {
    state.current = true
    render(<EquipmentPage />)
    const source = screen.getByRole('button', { name: /^Arma à esquerda de Player local:/ })
    fireEvent.mouseEnter(source)
    const tooltip = document.getElementById('equipment-item-tooltip')!
    expect(tooltip).toHaveTextContent('Field Staff')
    expect(tooltip).toHaveTextContent('Lv. 25 · Normal')
    expect(tooltip).toHaveTextContent('Force Attack · 8%')
    expect(tooltip.querySelector('.equipment-icon')).not.toBeNull()
    expect(source).toHaveAttribute('aria-describedby', tooltip.id)
    expect(source).not.toHaveAttribute('title')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.getElementById('equipment-item-tooltip')).not.toBeInTheDocument()
    fireEvent.focus(source)
    expect(document.getElementById('equipment-item-tooltip')!).toBeInTheDocument()
    fireEvent.blur(source)
    expect(document.getElementById('equipment-item-tooltip')).not.toBeInTheDocument()
    fireEvent.mouseEnter(screen.getByRole('button', { name: /^Helmet de Player local:/ }))
    expect(document.getElementById('equipment-item-tooltip')).not.toBeInTheDocument()
  })
  it('keeps the tooltip open while hovered and closes it on exit, scrolling or drag start', async () => {
    state.current = true
    render(<EquipmentPage />)
    const source = screen.getByRole('button', { name: /^Arma à esquerda de Player local:/ })
    fireEvent.mouseEnter(source)
    fireEvent.mouseLeave(source)
    fireEvent.mouseEnter(document.getElementById('equipment-item-tooltip')!)
    expect(document.getElementById('equipment-item-tooltip')!).toBeInTheDocument()
    fireEvent.mouseLeave(document.getElementById('equipment-item-tooltip')!)
    await waitFor(() => expect(document.getElementById('equipment-item-tooltip')).not.toBeInTheDocument())
    fireEvent.mouseEnter(source)
    fireEvent.scroll(window)
    expect(document.getElementById('equipment-item-tooltip')).not.toBeInTheDocument()
    fireEvent.mouseEnter(source)
    fireEvent.dragStart(source, { dataTransfer: { setData: vi.fn() } })
    expect(document.getElementById('equipment-item-tooltip')).not.toBeInTheDocument()
  })
  it('orders by name or profile level with alphabetical ties and keeps the selected filter', () => {
    state.transferTarget = true; state.extraMember = true
    render(<EquipmentPage />)
    fireEvent.change(screen.getByLabelText('Ordenar jogadores'), { target: { value: 'name' } })
    const names = () => within(screen.getByRole('list', { name: 'Equipamentos dos personagens' })).getAllByRole('listitem').map(row => within(row).getAllByRole('button')[0].textContent)
    expect(names()).toEqual(['Destinatário local', 'Outro player', 'Player local'])
    expect(screen.getByLabelText('Selecionar Player local').closest('li')).toHaveTextContent('Lv. 50')
    fireEvent.change(screen.getByLabelText('Ordenar jogadores'), { target: { value: 'level-desc' } })
    expect(names()).toEqual(['Outro player', 'Player local', 'Destinatário local'])
    fireEvent.change(screen.getByLabelText('Ordenar jogadores'), { target: { value: 'level-asc' } })
    expect(names()).toEqual(['Destinatário local', 'Outro player', 'Player local'])
    fireEvent.click(screen.getByLabelText('Selecionar Player local'))
    fireEvent.click(screen.getByLabelText('Selecionar Destinatário local'))
    fireEvent.click(screen.getByLabelText('Somente selecionados (2)'))
    fireEvent.change(screen.getByLabelText('Ordenar jogadores'), { target: { value: 'level-desc' } })
    expect(names()).toEqual(['Player local', 'Destinatário local'])
    fireEvent.change(screen.getByLabelText('Ordenar jogadores'), { target: { value: 'name' } })
    expect(names()).toEqual(['Destinatário local', 'Player local'])
  })
  it('shows every effect in the compact catalogue result', () => {
    state.multiEffects = true
    render(<EquipmentPage />); openEditor()
    const result = screen.getByRole('button', { name: 'Selecionar Intense Staff · iwstb25' })
    expect(result).toHaveTextContent('Lv. 50 · Intense · iwstb25 · Force Attack · 8% / Force Attack · 10%')
  })
  it('filters multiple selected players, preserves selections through search and clears the filter', () => {
    state.transferTarget = true; state.extraMember = true
    render(<EquipmentPage />)
    fireEvent.click(screen.getByLabelText('Selecionar Player local'))
    fireEvent.change(screen.getByLabelText('Pesquisar personagem'), { target: { value: 'Destinatário' } })
    fireEvent.click(screen.getByLabelText('Selecionar Destinatário local'))
    fireEvent.change(screen.getByLabelText('Pesquisar personagem'), { target: { value: '' } })
    fireEvent.click(screen.getByLabelText('Somente selecionados (2)'))
    expect(screen.getByRole('button', { name: 'Player local' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Destinatário local' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Outro player' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Limpar seleção' }))
    expect(screen.getByRole('button', { name: 'Outro player' })).toBeInTheDocument()
    expect(screen.getByLabelText('Somente selecionados (0)')).toBeDisabled()
    fireEvent.click(screen.getByLabelText('Selecionar Player local'))
    fireEvent.click(screen.getByLabelText('Somente selecionados (1)'))
    fireEvent.click(screen.getByLabelText('Selecionar Player local'))
    expect(screen.getByRole('button', { name: 'Outro player' })).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Selecionar Destinatário local'))
    expect(screen.getByLabelText('Somente selecionados (1)')).not.toBeChecked()
  })
  it('moves an item to another player row with automatic slot and captured versions', async () => {
    state.current = true; state.transferTarget = true; state.targetEmpty = true
    render(<EquipmentPage />)
    const source = screen.getByRole('button', { name: /^Arma à esquerda de Player local:/ })
    expect(source).toHaveAttribute('draggable', 'true')
    const dataTransfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' }
    fireEvent.dragStart(source, { dataTransfer })
    fireEvent.drop(screen.getByRole('button', { name: 'Destinatário local' }).closest('li')!, { dataTransfer })
    await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(1))
    expect(state.mutate.mock.calls[0][0]).toMatchObject({ action: 'TRANSFER', memberId: 1, slot: 'Weapon', expectedVersion: 1,
      transfer: { memberId: 3, slot: 'Weapon', expectedVersion: 0, replaceCurrent: false } })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
  it('requires confirmation before displacing an occupied accessory on the chosen side', async () => {
    state.current = true; state.currentSlot = 'Ring1'; state.transferTarget = true
    render(<EquipmentPage />)
    const dataTransfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' }
    fireEvent.dragStart(screen.getByRole('button', { name: /^Anel à esquerda de Player local:/ }), { dataTransfer })
    fireEvent.drop(screen.getByRole('button', { name: /^Anel à direita de Destinatário local:/ }), { dataTransfer })
    expect(state.mutate).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Item do destinatário')
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Anel à direita')
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar envio' }))
    await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(1))
    expect(state.mutate.mock.calls[0][0].transfer).toMatchObject({ memberId: 3, slot: 'Ring2', replaceCurrent: true })
  })
  it('rejects self-drops, unrelated slots and moving a weapon to the other weapon slot', () => {
    state.current = true; state.transferTarget = true; state.targetEmpty = true
    render(<EquipmentPage />)
    const dataTransfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' }
    fireEvent.dragStart(screen.getByRole('button', { name: /^Arma à esquerda de Player local:/ }), { dataTransfer })
    for (const name of [/^Arma à esquerda de Player local:/, /^Helmet de Destinatário local:/, /^Arma à direita de Destinatário local:/]) {
      fireEvent.drop(screen.getByRole('button', { name }), { dataTransfer })
    }
    expect(state.mutate).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
  it('opens a public read-only roster with name and gear score ordering', () => {
    state.admin = false; state.userId = 1; state.current = true; state.transferTarget = true
    render(<EquipmentPage />)
    expect(screen.queryByRole('button', { name: 'Destinatário local' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Destinatário')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ver jogadores' }))
    const roster=screen.getByRole('list', { name: 'Equipamentos dos personagens' })
    const names=() => within(roster).getAllByRole('button', { name: /^(Player local|Destinatário local)$/ }).map(b=>b.textContent)
    expect(names()).toEqual(['Destinatário local','Player local'])
    fireEvent.change(screen.getByLabelText('Ordenar jogadores'), { target: { value: 'gs-desc' } })
    expect(names()).toEqual(['Destinatário local','Player local'])
    fireEvent.change(screen.getByLabelText('Ordenar jogadores'), { target: { value: 'gs-asc' } })
    expect(names()).toEqual(['Player local','Destinatário local'])
    expect(within(roster).getByText(/2.500 GS/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Limpar equipamentos de Destinatário local' })).not.toBeInTheDocument()
    const otherItem=within(roster).getByRole('button', { name: /^Arma à esquerda de Destinatário local:/ })
    expect(otherItem).toHaveAttribute('draggable','false')
    fireEvent.click(otherItem)
    expect(screen.getByRole('group', { name: 'Inventário de Destinatário local' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Registrar em Arma' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Histórico' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Registrar entrega' })).not.toBeInTheDocument()
    expect(state.historyQuery).toHaveBeenLastCalledWith(3,false)
    expect(state.mutate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Meus equipamentos' }))
    expect(screen.getByRole('group', { name: 'Inventário de Player local' })).toBeInTheDocument()
  })
  it('keeps a failed drag transfer available for retry with the same operation id', async () => {
    state.current = true; state.transferTarget = true; state.targetEmpty = true
    state.mutate.mockRejectedValueOnce(new Error('Resposta perdida'))
    render(<EquipmentPage />)
    const dataTransfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' }
    fireEvent.dragStart(screen.getByRole('button', { name: /^Arma à esquerda de Player local:/ }), { dataTransfer })
    fireEvent.drop(screen.getByRole('button', { name: 'Destinatário local' }).closest('li')!, { dataTransfer })
    await screen.findByRole('alertdialog')
    const first = state.mutate.mock.calls[0][0]
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar envio' }))
    await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(2))
    expect(state.mutate.mock.calls[1][0]).toEqual(first)
  })
  it.each([true, false])('opens an editable roster slot directly with Grade C (admin=%s)', admin => {
    state.admin = admin; state.userId = 1
    render(<EquipmentPage />)
    fireEvent.click(screen.getByRole('button', { name: state.admin ? /^Helmet de Player local:/ : /^Helmet:/ }))
    expect(screen.getByRole('heading', { name: 'Registrar equipamento · Helmet' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'C' })).toHaveAttribute('aria-pressed', 'true')
    expect(state.catalog).toHaveBeenLastCalledWith('HELMET', '', 0, true, { race: 'CORA', grade: 3 })
    expect(state.mutate).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByRole('group', { name: 'Inventário de Player local' })).getByRole('button', { name: /^Shoes:/ }))
    expect(screen.getByRole('heading', { name: 'Registrar equipamento · Shoes' })).toBeInTheDocument()
  })
  it('renders category silhouettes in empty slots and preserves occupied item previews', () => {
    state.current = true
    render(<EquipmentPage />)
    const row=screen.getByRole('list', { name: 'Equipamentos dos personagens' })
    expect(row.querySelectorAll('.equipment-slot-empty')).toHaveLength(11)
    expect(row.querySelectorAll('.equipment-mini-slot.is-filled')).toHaveLength(1)
    expect(row.querySelector('.equipment-mini-slot.is-filled .equipment-icon')).not.toBeNull()
  })
  it('shows a compact roster with twelve preview positions and no wide table', () => {
    render(<EquipmentPage />)
    const roster = screen.getByRole('list', { name: 'Equipamentos dos personagens' })
    expect(within(roster).getAllByRole('group')).toHaveLength(3)
    expect(within(roster).getAllByRole('button')).toHaveLength(16)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
  it('inspects twelve slots with amulets around Helmet and a Cloak slot', () => {
    state.current = true; state.admin = false; state.userId = 1
    render(<EquipmentPage />); inspect()
    const inventory = screen.getByRole('group', { name: 'Inventário de Player local' })
    expect(within(inventory).getAllByRole('button')).toHaveLength(12)
    expect(screen.queryByRole('img', { name: 'Ícone da classe — provisório' })).not.toBeInTheDocument()
    expect(within(inventory).getByRole('button', { name: /^Cloak:/ })).toBeInTheDocument()
    expect(within(inventory).getByRole('button', { name: /^Amuleto à esquerda:/ })).toHaveTextContent('Amuleto')
    expect(within(inventory).getByRole('button', { name: /^Amuleto à direita:/ })).toHaveTextContent('Amuleto')
    expect(screen.getByRole('region', { name: 'Detalhes da posição' })).toHaveTextContent('Force Attack · 8%')
    expect(screen.getByRole('button', { name: 'Registrar em Arma' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Histórico' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Registrado por/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Fechar inspeção' })).not.toBeInTheDocument()
  })
  it('saves the owner item immediately without confirmation or audit details', async () => {
    state.admin = false; state.userId = 1; state.current = true
    render(<EquipmentPage />); openEditor(); selectItem()
    expect(state.historyQuery).toHaveBeenLastCalledWith(1, false)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Data')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Destinatário')).not.toBeInTheDocument()
    await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(1))
    expect(state.mutate.mock.calls[0][0]).toMatchObject({ action: 'CREATE', memberId: 1, useAsCurrent: true, origin: 'INITIAL', expectedVersion: 1 })
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Adicionar ao slot' })).not.toBeInTheDocument())
  })

  it('supports keyboard navigation between inspection and history', () => {
    render(<EquipmentPage />); inspect()
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Equipamento atual' }), { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: /^Itens anteriores/ })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('tab', { name: /^Itens anteriores/ }), { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'Histórico' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Histórico' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Histórico' }), { key: 'Home' })
    expect(screen.getByRole('tab', { name: 'Equipamento atual' })).toHaveFocus()
    expect(screen.getByRole('group', { name: 'Inventário de Player local' })).toBeInTheDocument()
  })
  it('opens the inspection beside the roster and lists only available previous records', () => {
    state.current = true
    state.history = [record, { ...record, id: 21, name: 'Item anterior' }, { ...record, id: 22, status: 'TRANSFERRED' },
      { ...record, id: 23, status: 'CANCELLED' }, { ...record, id: 24, status: 'CORRECTED' }, { ...record, id: 25, deliveryOnly: true }]
    render(<EquipmentPage />); inspect()
    const panel = screen.getByRole('region', { name: 'Equipamentos de Player local' })
    expect(panel.parentElement).toHaveClass('equipment-workspace--split')
    expect(panel.parentElement).toContainElement(screen.getByRole('list', { name: 'Equipamentos dos personagens' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Itens anteriores (1)' }))
    expect(within(screen.getByRole('tabpanel')).getByRole('button', { name: 'Arrastar ou repassar Item anterior · registro 21' })).toHaveAttribute('draggable', 'true')
    expect(within(screen.getByRole('tabpanel')).getAllByRole('listitem')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Fechar inspeção' }))
    expect(screen.queryByRole('region', { name: 'Equipamentos de Player local' })).not.toBeInTheDocument()
  })
  it('drags an earlier item to an empty destination using its record and current source version', async () => {
    state.current = true; state.transferTarget = true; state.targetEmpty = true
    state.history = [{ ...record, id: 21, name: 'Item anterior' }]
    render(<EquipmentPage />); inspect()
    fireEvent.click(screen.getByRole('tab', { name: /^Itens anteriores/ }))
    fireEvent.dragStart(screen.getByRole('button', { name: 'Arrastar ou repassar Item anterior · registro 21' }), { dataTransfer: { setData: vi.fn() } })
    const target = screen.getByRole('button', { name: 'Destinatário local' }).closest('li')!
    fireEvent.drop(target, { dataTransfer: { getData: vi.fn() } })
    await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(1))
    expect(state.mutate.mock.calls[0][0]).toMatchObject({ action: 'TRANSFER', assignmentId: 21, memberId: 1, expectedVersion: 1,
      transfer: { memberId: 3, slot: 'Weapon', expectedVersion: 0, replaceCurrent: false } })
    expect(state.slotEdit).not.toHaveBeenCalled()
  })
  it('offers keyboard repass and confirms replacing an occupied destination', async () => {
    state.transferTarget = true
    state.history = [{ ...record, id: 21, name: 'Item anterior' }]
    render(<EquipmentPage />); inspect()
    fireEvent.click(screen.getByRole('tab', { name: /^Itens anteriores/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Arrastar ou repassar Item anterior · registro 21' }))
    fireEvent.change(screen.getByLabelText('Destinatário'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: /^Enviar$/ }))
    expect(state.mutate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar envio' }))
    await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(1))
    expect(state.mutate.mock.calls[0][0]).toMatchObject({ assignmentId: 21, transfer: { memberId: 3, expectedVersion: 2, replaceCurrent: true } })
  })
  it('hides previous equipment from ordinary players', () => {
    state.admin = false; state.userId = 1; state.history = [record]
    render(<EquipmentPage />)
    expect(screen.queryByRole('tab', { name: /^Itens anteriores/ })).not.toBeInTheDocument()
    expect(state.historyQuery).toHaveBeenLastCalledWith(1, false)
  })
  it('lets a previous ring choose either side for a keyboard transfer', async () => {
    state.transferTarget = true; state.targetEmpty = true
    state.history = [{ ...record, id: 21, slot: 'Ring1', category: 'RING', name: 'Anel anterior' }]
    render(<EquipmentPage />); inspect()
    fireEvent.click(screen.getByRole('tab', { name: /^Itens anteriores/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Arrastar ou repassar Anel anterior · registro 21' }))
    fireEvent.change(screen.getByLabelText('Destinatário'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Posição', { exact: true }), { target: { value: 'Ring2' } })
    fireEvent.click(screen.getByRole('button', { name: /^Enviar$/ }))
    await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(1))
    expect(state.mutate.mock.calls[0][0]).toMatchObject({ assignmentId: 21, slot: 'Ring1', transfer: { slot: 'Ring2' } })
  })
  it('discards a previous record through the audited cancellation without restoring the current slot', async () => {
    state.current = true; state.history = [{ ...record, id: 21, name: 'Item anterior' }]
    render(<EquipmentPage />); inspect()
    fireEvent.click(screen.getByRole('tab', { name: /^Itens anteriores/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Descartar Item anterior · registro 21' }))
    expect(screen.queryByLabelText('Após cancelar, esta posição deve ficar')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Item vendido no jogo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Revisar e confirmar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar registro' }))
    await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(1))
    expect(state.mutate.mock.calls[0][0]).toMatchObject({ action: 'CANCEL', assignmentId: 21, expectedVersion: 1, useAsCurrent: false })
    expect(state.mutate.mock.calls[0][0].restoration).toBeUndefined()
  })
  it('searches only the chosen category after typing and keeps grade criteria visible', async () => {
    render(<EquipmentPage />); openEditor('Helmet')
    expect(state.catalog).toHaveBeenLastCalledWith('HELMET', '', 0, true, { race: 'CORA', grade: 3 })
    fireEvent.change(screen.getByLabelText('Pesquisar item por nome ou código'), { target: { value: ' ihb ' } })
    await waitFor(() => expect(state.catalog).toHaveBeenLastCalledWith('HELMET', 'ihb', 0, true, { race: 'CORA', grade: 3 }))
    expect(screen.getAllByText(/Armas: grades B.C/).length).toBeGreaterThan(0)
  })
  it('labels Grade 3 as Type C and Grade 1 as Intense', () => {
    state.catalogGrade = 3
    render(<EquipmentPage />); openEditor()
    expect(screen.getByRole('button', { name: 'Selecionar Intense Staff · iwstb25' })).toHaveTextContent('Type C')
    expect(screen.queryByText(/Orange/)).not.toBeInTheDocument()
  })
  it('defaults to Cora and orders class buttons Melee, Ranger, Force', () => {
    render(<EquipmentPage />); openEditor('Helmet')
    expect(screen.getByLabelText('Raça do equipamento')).toHaveValue('CORA')
    expect(screen.queryByText(/Posição atual:/)).not.toBeInTheDocument()
    expect(screen.queryByText('Itens sem restrição de classe também aparecem.')).not.toBeInTheDocument()
    expect(state.catalog).toHaveBeenLastCalledWith('HELMET', '', 0, true, { race: 'CORA', grade: 3 })
    const classes = within(screen.getByRole('group', { name: 'Classe do equipamento' })).getAllByRole('button')
    expect(classes.map(button => button.textContent)).toEqual(['Melee', 'Ranger', 'Force', 'Todas as classes'])
    fireEvent.click(screen.getByRole('button', { name: 'Melee' }))
    expect(state.catalog).toHaveBeenLastCalledWith('HELMET', '', 0, true, { race: 'CORA', grade: 3, equipmentClass: 'MELEE' })
    fireEvent.click(screen.getByRole('button', { name: 'Force' }))
    expect(screen.getByRole('button', { name: 'Adicionar ao slot' })).toBeDisabled()
    expect(state.catalog).toHaveBeenLastCalledWith('HELMET', '', 0, true, { race: 'CORA', grade: 3, equipmentClass: 'FORCE' })
    fireEvent.change(screen.getByLabelText('Raça do equipamento'), { target: { value: 'ALL' } })
    expect(state.catalog).toHaveBeenLastCalledWith('HELMET', '', 0, true, { race: 'ALL', grade: 3, equipmentClass: 'FORCE' })
    fireEvent.click(screen.getByRole('button', { name: 'Todas as classes' }))
    expect(state.catalog).toHaveBeenLastCalledWith('HELMET', '', 0, true, { race: 'ALL', grade: 3, equipmentClass: undefined })
  })
  it('combines buttons with search and automatically selects a unique model', async () => {
    state.catalogGrade = 3
    render(<EquipmentPage />); openEditor('Helmet')
    expect(screen.queryByRole('button', { name: '37' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Nível do item' })).getAllByRole('button').map(b => b.textContent)).toEqual(['Todos 35–55', '43 → 38', '45 → 40', '47 → 42', '50 → 45'])
    fireEvent.click(screen.getByRole('button', { name: '43 → 38' }))
    expect(screen.getByRole('button', { name: 'Adicionar ao slot' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Fine' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Adicionar ao slot' })).toBeEnabled())
    expect(state.catalog).toHaveBeenLastCalledWith('HELMET', '', 0, true, { race: 'CORA', level: 38, grade: 3, ability: 'Fine' })
    fireEvent.change(screen.getByLabelText('Pesquisar item por nome ou código'), { target: { value: 'staff' } })
    expect(screen.getByRole('button', { name: 'Adicionar ao slot' })).toBeDisabled()
    await waitFor(() => expect(state.catalog).toHaveBeenLastCalledWith('HELMET', 'staff', 0, true, { race: 'CORA', level: 38, grade: 3, ability: 'Fine' }))
    fireEvent.click(screen.getByRole('button', { name: 'B' }))
    expect(state.catalog).toHaveBeenLastCalledWith('HELMET', 'staff', 0, true, { race: 'CORA', level: undefined, grade: 1, ability: undefined })
    expect(screen.queryByRole('group', { name: 'Habilidade Type C' })).not.toBeInTheDocument()
  })
  it('keeps ambiguous matches explicit and clears an old selection when criteria change', async () => {
    state.catalogTotal = 2
    render(<EquipmentPage />); openEditor()
    fireEvent.click(screen.getByRole('button', { name: 'B' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Nível da arma' }), { target: { value: '50' } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Adicionar ao slot' })).toBeDisabled())
    expect(screen.getByText(/2 modelos correspondem/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'ALL' }))
    expect(state.catalog).toHaveBeenLastCalledWith('WEAPON', '', 0, true, { race: 'CORA', level: 50, grade: undefined, ability: undefined })
  })
  it.each([
    ['Weapon', false, 37, 45], ['Weapon2', false, 48, 45],
    ['Weapon', true, 37, 37], ['Weapon2', true, 48, 48],
  ] as const)('initializes %s level with occupied=%s', (slot, occupied, currentLevel, expected) => {
    state.current = occupied; state.currentSlot = slot; state.currentLevel = currentLevel
    render(<EquipmentPage />); openEditor(slot)
    expect(screen.getByRole('spinbutton', { name: 'Nível da arma' })).toHaveValue(expected)
    expect(state.catalog).toHaveBeenLastCalledWith('WEAPON', '', 0, true, { race: 'CORA', grade: 3, level: expected })
    expect(state.mutate).not.toHaveBeenCalled()
  })
  it.each([['Weapon', true, 1, 1], ['Weapon2', true, 3, 3], ['Weapon', false, 1, 3]] as const)('defaults %s grade for occupied=%s grade=%s', (slot, occupied, currentGrade, expected) => {
    state.current = occupied; state.currentSlot = slot; state.currentLevel = 45; state.currentGrade = currentGrade
    render(<EquipmentPage />); openEditor(slot)
    expect(screen.getByRole('button', { name: expected === 1 ? 'B' : 'C' })).toHaveAttribute('aria-pressed', 'true')
    expect(state.catalog).toHaveBeenLastCalledWith('WEAPON', '', 0, true, { race: 'CORA', grade: expected, level: 45 })
  })
  it('records an unequipped delivery on item selection with the previously chosen quantity', async () => {
    state.current = true; state.currentLevel = 45; state.currentGrade = 1
    render(<EquipmentPage />); inspect()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar entrega' }))
    const form = screen.getByRole('form', { name: 'Registrar entrega de item' })
    expect(within(form).queryByLabelText('Destinatário')).not.toBeInTheDocument()
    fireEvent.click(within(form).getByRole('button', { name: 'B' }))
    expect(within(form).queryByRole('button', { name: 'Registrar entrega' })).not.toBeInTheDocument()
    const candidate = within(form).getByRole('button', { name: 'Selecionar Intense Staff · iwstb25' })
    const quantity = within(form).getByRole('spinbutton', { name: 'Quantidade' })
    fireEvent.change(quantity, { target: { value: '0' } })
    expect(candidate).toBeDisabled()
    fireEvent.change(quantity, { target: { value: '1.5' } })
    expect(candidate).toBeDisabled()
    expect(state.mutate).not.toHaveBeenCalled()
    fireEvent.change(quantity, { target: { value: '3' } })
    fireEvent.click(candidate)
    await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(1))
    expect(state.mutate.mock.calls[0][0]).toMatchObject({ action: 'CREATE', memberId: 1, slot: 'Weapon', catalogId: 7, origin: 'GUILD_DISTRIBUTION', useAsCurrent: false, expectedVersion: 1, quantity: 3 })
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Itens entregues' })).toHaveAttribute('aria-selected', 'true'))
  })
  it('lets admins register deliveries in another category and hides the feature from members', () => {
    render(<EquipmentPage />); inspect()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar entrega' }))
    fireEvent.change(screen.getByLabelText('Tipo do item entregue'), { target: { value: 'Ring1' } })
    expect(state.catalog).toHaveBeenLastCalledWith('RING', '', 0, true, { race: 'CORA' })
    cleanup(); state.admin = false; state.userId = 1
    render(<EquipmentPage />)
    expect(screen.queryByRole('button', { name: 'Registrar entrega' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Itens entregues' })).not.toBeInTheDocument()
    expect(state.historyQuery).toHaveBeenLastCalledWith(1, false)
    fireEvent.click(screen.getByRole('button', { name: 'Ver jogadores' }))
    expect(screen.queryByRole('button', { name: /^Registrar entrega para/ })).not.toBeInTheDocument()
  })
  it('waits for an explicit effect before registering a delivery and retries without duplicating the request', async () => {
    state.multiEffects = true
    state.mutate.mockRejectedValueOnce(new Error('Resposta perdida'))
    render(<EquipmentPage />); inspect()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar entrega' }))
    const form = screen.getByRole('form', { name: 'Registrar entrega de item' })
    selectItem()
    expect(state.mutate).not.toHaveBeenCalled()
    fireEvent.submit(form)
    expect(state.mutate).not.toHaveBeenCalled()
    fireEvent.change(within(form).getByLabelText('Efeito extra do item'), { target: { value: '15:0.1' } })
    await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(1))
    expect(state.mutate.mock.calls[0][0]).toMatchObject({ quantity: 1, effectKey: '15:0.1', useAsCurrent: false })
    await waitFor(() => expect(within(form).getByRole('button', { name: 'Fechar' })).toBeEnabled())
    fireEvent.change(within(form).getByLabelText('Efeito extra do item'), { target: { value: '15:0.1' } })
    await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(2))
    expect(state.mutate.mock.calls[1][0]).toEqual(state.mutate.mock.calls[0][0])
  })
  it('shows totals grouped by level and grade in the private deliveries tab', () => {
    state.history = [
      { ...record, id: 1, deliveryOnly: true, level: 45, grade: 1 },
      { ...record, id: 2, deliveryOnly: true, level: 45, grade: 1, status: 'TRANSFERRED' },
      { ...record, id: 3, deliveryOnly: true, level: 45, grade: 1, status: 'CANCELLED' },
      { ...record, id: 4, name: 'Distribuição equipada' },
      { ...record, id: 5, name: 'Equipamento inicial', origin: 'INITIAL' },
    ]
    render(<EquipmentPage />); inspect()
    fireEvent.click(screen.getByRole('tab', { name: 'Itens entregues' }))
    const totals = screen.getByRole('region', { name: 'Totais recebidos' })
    expect(totals).toHaveTextContent('Arma · Lv. 45 · B · Intense')
    expect(within(totals).getAllByRole('listitem')).toHaveLength(2)
    expect(totals).toHaveTextContent('Arma · Lv. 45 · B · Intense2')
    // Item equipado no slot como "Entrega da guild" também é entrega; equipamento inicial não.
    expect(screen.getByRole('list', { name: 'Itens entregues' })).toHaveTextContent('Cancelado')
    expect(screen.getByRole('list', { name: 'Itens entregues' })).toHaveTextContent('Distribuição equipada')
    expect(screen.getByRole('list', { name: 'Itens entregues' })).not.toHaveTextContent('Equipamento inicial')
    fireEvent.click(screen.getByRole('tab', { name: /^Histórico$/ }))
    const equipmentHistory = screen.getByRole('list', { name: 'Histórico de equipamentos' })
    expect(equipmentHistory).toHaveTextContent('Distribuição equipada')
    expect(within(equipmentHistory).getAllByRole('listitem')).toHaveLength(2)
  })
  it('hides game client syncs from the history but keeps admin corrections', () => {
    state.history = [
      { ...record, id: 1, name: 'Sincronizado pelo jogo', origin: 'GAME_CLIENT', actorId: record.memberId },
      { ...record, id: 2, name: 'Corrigido pela administração', origin: 'GAME_CLIENT', actorId: record.memberId + 1000 },
      { ...record, id: 3, name: 'Entrega manual', origin: 'GUILD_DISTRIBUTION' },
    ]
    render(<EquipmentPage />); inspect()
    fireEvent.click(screen.getByRole('tab', { name: /^Histórico$/ }))
    const equipmentHistory = screen.getByRole('list', { name: 'Histórico de equipamentos' })
    expect(equipmentHistory).not.toHaveTextContent('Sincronizado pelo jogo')
    expect(equipmentHistory).toHaveTextContent('Corrigido pela administração')
    expect(equipmentHistory).toHaveTextContent('Entrega manual')
  })
  it('filters weapons by a numeric level, supports hover wheel and keeps the bounds', () => {
    render(<EquipmentPage />); openEditor()
    const input=screen.getByRole('spinbutton', { name: 'Nível da arma' })
    fireEvent.change(input, { target: { value: '36' } })
    fireEvent.click(screen.getByRole('button', { name: 'B' }))
    expect(input).toHaveValue(36)
    fireEvent.click(screen.getByRole('button', { name: 'C' }))
    expect(state.catalog).toHaveBeenLastCalledWith('WEAPON', '', 0, true, { race: 'CORA', grade: 3, level: 36 })
    expect(input).not.toHaveFocus()
    const wheel = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true })
    fireEvent(input, wheel); expect(input).toHaveValue(37)
    expect(wheel.defaultPrevented).toBe(true)
    fireEvent.wheel(input, { deltaY: 100 }); expect(input).toHaveValue(36)
    fireEvent.change(input, { target: { value: '50' } }); fireEvent.wheel(input, { deltaY: -100 }); expect(input).toHaveValue(50)
    fireEvent.change(input, { target: { value: '35' } }); fireEvent.wheel(input, { deltaY: 100 }); expect(input).toHaveValue(35)
    fireEvent.change(input, { target: { value: '4' } }); expect(input).toHaveAttribute('aria-invalid','true')
    expect(state.catalog.mock.calls.at(-1)?.[3]).toBe(false)
  })
  it.each(['Ring1','Cloak'])('does not apply armor grades or level restrictions to %s', slot => {
    render(<EquipmentPage />); openEditor(slot)
    if (slot === 'Cloak') expect(screen.getByLabelText('Raça do equipamento')).toBeDisabled()
    else expect(screen.getByLabelText('Raça do equipamento')).toBeEnabled()
    expect(screen.queryByRole('group', { name: 'Grade do item' })).not.toBeInTheDocument()
    expect(state.catalog).toHaveBeenLastCalledWith(slot === 'Ring1' ? 'RING' : 'CLOAK', '', 0, true, { race: 'CORA' })
  })
  it('adds Cloak immediately in its own slot', async () => {
    render(<EquipmentPage />); openEditor('Cloak'); selectItem()
    expect(state.catalog).toHaveBeenLastCalledWith('CLOAK', '', 0, true, { race: 'CORA' })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(1))
    expect(state.mutate.mock.calls[0][0]).toMatchObject({ slot: 'Cloak', useAsCurrent: true })
  })

  it('identifies unclassified values as original effects requiring review', () => {
    state.multiEffects = true; state.effectsNote = 'Padrão não confirmado; valores originais mantidos para conferência.'
    render(<EquipmentPage />); openEditor(); selectItem()
    expect(screen.getByLabelText('Efeito original — conferir separação do padrão')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('valores originais')
  })
  it('clears the selected item and its effect explicitly', () => {
    state.multiEffects = true
    render(<EquipmentPage />); openEditor(); selectItem()
    expect(screen.getByLabelText('Efeito extra do item')).toHaveValue('')
    fireEvent.click(screen.getByRole('button', { name: 'Limpar seleção' }))
    expect(screen.getByLabelText('Efeito extra do item')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Adicionar ao slot' })).toBeDisabled()
  })
  it('saves directly for administrators and ignores duplicate rapid clicks', () => {
    state.mutate.mockImplementation(() => new Promise(() => {}))
    render(<EquipmentPage />); openEditor(); selectItem(); selectItem()
    expect(screen.queryByLabelText('Usar como equipamento atual')).not.toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(state.mutate).toHaveBeenCalledTimes(1)
    expect(state.mutate.mock.calls[0][0]).toMatchObject({ action: 'CREATE', memberId: 1, slot: 'Weapon', expectedVersion: 0, catalogId: 7, effectKey: '15:0.08', useAsCurrent: true })
  })
  it('waits for an explicit effect when several exist, then saves without confirmation', async () => {
    state.multiEffects = true
    render(<EquipmentPage />); openEditor(); selectItem()
    expect(state.mutate).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Efeito extra do item'), { target: { value: '15:0.1' } })
    await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(1))
    expect(state.mutate.mock.calls[0][0]).toMatchObject({ effectKey: '15:0.1', useAsCurrent: true })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
  it('keeps a failed selection open and reuses the request identifier on retry', async () => {
    state.mutate.mockRejectedValueOnce(new Error('Falha de rede'))
    render(<EquipmentPage />); openEditor(); selectItem()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Adicionar ao slot' })).toBeEnabled())
    const first = state.mutate.mock.calls[0][0]
    selectItem()
    await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(2))
    expect(state.mutate.mock.calls[1][0]).toEqual(first)
  })

  it('immediately equips only the selected second weapon position', async () => {
    render(<EquipmentPage />); openEditor('Weapon2'); selectItem()
    await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(1))
    expect(state.mutate.mock.calls[0][0]).toMatchObject({ slot: 'Weapon2', useAsCurrent: true })
  })

  it('requires an explicit empty choice when cancelling current equipment', async () => {
    state.current = true; state.history = [record]
    render(<EquipmentPage />); inspect()
    fireEvent.click(screen.getByRole('tab', { name: 'Histórico' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    const choice = screen.getByLabelText('Após cancelar, esta posição deve ficar')
    expect(choice).toBeRequired(); expect(choice).toHaveValue('')
    fireEvent.change(choice, { target: { value: 'empty' } })
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Entrega registrada para teste' } })
    fireEvent.click(screen.getByRole('button', { name: 'Revisar e confirmar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar registro' }))
    await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(1))
    expect(state.mutate.mock.calls[0][0]).toMatchObject({ action: 'CANCEL', assignmentId: 20, restoration: 'EMPTY', expectedVersion: 1 })
  })
  it('configures a repass before selection and saves both without a dialog', async () => {
    state.current = true; state.transferTarget = true
    render(<EquipmentPage />); openEditor()
    fireEvent.change(screen.getByLabelText('Destinatário'), { target: { value: '3' } })
    expect(screen.queryByLabelText('Posição do acessório')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Selecionar Intense Staff · iwstb25' })).toBeDisabled()
    fireEvent.click(screen.getByLabelText('Substituir equipamento do destinatário e preservar no histórico'))
    selectItem()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(1))
    expect(state.mutate.mock.calls[0][0]).toMatchObject({ memberId: 1, slot: 'Weapon', useAsCurrent: true, transfer: { memberId: 3, expectedVersion: 2, replaceCurrent: true } })
    expect(state.mutate.mock.calls[0][0].transfer.slot).toBeUndefined()
  })
  it.each([true, false])('sends the current item with an explicit button and no catalogue selection (empty=%s)', async empty => {
    state.current = true; state.transferTarget = true; state.targetEmpty = empty
    render(<EquipmentPage />); openEditor()
    expect(screen.getByRole('button', { name: 'Enviar item' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Destinatário'), { target: { value: '3' } })
    expect(state.mutate).not.toHaveBeenCalled()
    const send = screen.getByRole('button', { name: 'Enviar item' })
    if (empty) expect(screen.queryByLabelText('Substituir equipamento do destinatário e preservar no histórico')).not.toBeInTheDocument()
    else {
      expect(send).toBeDisabled()
      fireEvent.click(screen.getByLabelText('Substituir equipamento do destinatário e preservar no histórico'))
    }
    expect(send).toBeEnabled()
    fireEvent.click(send)
    expect(state.mutate).toHaveBeenCalledTimes(1)
    expect(state.mutate.mock.calls[0][0]).toMatchObject({ action: 'TRANSFER', memberId: 1, slot: 'Weapon',
      useAsCurrent: false, catalogId: undefined, transfer: { memberId: 3, expectedVersion: empty ? 0 : 2, replaceCurrent: !empty } })
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Enviar item' })).not.toBeInTheDocument())
  })

  it('offers only left and right for accessories and clears consent when the side changes', async () => {
    state.current = true; state.currentSlot = 'Ring1'; state.transferTarget = true
    render(<EquipmentPage />); openEditor('Ring1')
    fireEvent.change(screen.getByLabelText('Destinatário'), { target: { value: '3' } })
    const sides = screen.getByLabelText('Posição do acessório')
    expect(within(sides).getAllByRole('option').map(o => o.textContent)).toEqual(['Anel à esquerda', 'Anel à direita'])
    fireEvent.click(screen.getByLabelText('Substituir equipamento do destinatário e preservar no histórico'))
    fireEvent.change(sides, { target: { value: 'Ring2' } })
    expect(screen.getByRole('button', { name: 'Adicionar ao slot' })).toBeDisabled()
    fireEvent.click(screen.getByLabelText('Substituir equipamento do destinatário e preservar no histórico'))
    selectItem()
    await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(1))
    expect(state.mutate.mock.calls[0][0].transfer).toMatchObject({ memberId: 3, slot: 'Ring2' })
  })
  it('shows transferred history without offering to equip or edit it again', () => {
    state.history = [{ ...record, status: 'TRANSFERRED', statusReason: 'Repassado para Destinatário local · registro #30' }]
    render(<EquipmentPage />); inspect(); fireEvent.click(screen.getByRole('tab', { name: 'Histórico' }))
    expect(screen.getByText('Repassado')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Equipar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Corrigir' })).not.toBeInTheDocument()
  })
  it('shows status changes separately from the original reason', () => {
    state.history = [{ ...record, status: 'CANCELLED', reason: 'Motivo original', statusReason: 'Personagem errado', statusActorName: 'Líder local' }]
    render(<EquipmentPage />); inspect(); fireEvent.click(screen.getByRole('tab', { name: 'Histórico' }))
    expect(screen.getByText('Motivo: Motivo original')).toBeInTheDocument()
    expect(screen.getByText('Motivo da alteração: Personagem errado')).toBeInTheDocument()
    expect(screen.getByText('Por Líder local')).toBeInTheDocument()
  })
  it('renders icons only for the matching source and bounded index', () => {
    const { container, rerender } = render(<EquipmentIcon item={{ category: 'HELMET', iconId: 16, sourceHash: sheets.sourceHash }} size={64} />)
    expect(container.firstChild).toHaveStyle({ backgroundPosition: '0px -64px', backgroundSize: '1024px 4048px' })
    rerender(<EquipmentIcon item={{ category: 'WEAPON', iconId: 0, sourceHash: sheets.sourceHash }} />)
    expect(container.querySelector('.equipment-icon--missing')).toBeNull()
    for (const item of [{ category: 'WEAPON', iconId: 1024, sourceHash: sheets.sourceHash }, { category: 'WEAPON', iconId: 0, sourceHash: 'old' }]) {
      rerender(<EquipmentIcon item={item} />)
      expect(container.querySelector('.equipment-icon--missing')).toHaveTextContent('?')
    }
  })
})
