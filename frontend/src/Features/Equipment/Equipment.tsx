import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useAuthContext } from '@/Features/Auth/contexts/AuthContext'
import { useEquipment, useEquipmentHistory, useEquipmentCatalog, useEquipmentOperation, useEquipmentSlotEdit, useEquipmentImportStatus, useEquipmentReviews, useEquipmentReviewAction } from '@/Domain/Equipment/hooks/useEquipment'
import { EQUIPMENT_GROUPS, SLOT_CATEGORY, type CatalogFilters, type CurrentSlot, type EquipmentAssignment, type EquipmentEffect, type EquipmentItem, type EquipmentOperation, type EquipmentSlot, type EquipmentSlotEdit, type EquipmentSlotEditResult, type MemberEquipment } from '@/Domain/Equipment/types'
import { useMember } from '@/Domain/Member/hooks/useMembers'
import { isGuildDelivery, summarizeDeliveries } from '@/Domain/Equipment/utils/equipmentDeliveries'
import { armorClassForCharacter, playerClassForEquipmentList, weaponClassForCharacter } from '@/Domain/Equipment/utils/equipmentClass'
import { gradeLabel as catalogGradeLabel, gradeColor } from '@/Domain/Catalog/utils/catalogUtils'
import { Panel } from '@/Shared/ui/components/Panel/Panel'
import { Button } from '@/Shared/ui/components/Button/Button'
import { MemberClassIcon } from '@/Shared/ui/components/MemberClassIcon/MemberClassIcon'
import { ConfirmDialog } from '@/Shared/ui/components/ConfirmDialog/ConfirmDialog'
import { useAppToast } from '@/Shared/ui/components/AppToast/AppToast'
import { EquipmentIcon, EmptyEquipmentSlot } from './EquipmentIcon'
import { EquipmentRelics } from './EquipmentRelics'
import { formatEquipmentEffect } from '@/Domain/Equipment/utils/equipmentEffects'
import './Equipment.styles.scss'

function effectLabel(effect: EquipmentEffect) {
  return formatEquipmentEffect(effect)
}
/** Registro criado pela DLL do jogo; uma correção da administração tem o admin como autor e continua aparecendo. */
function isGameClientSync(record: EquipmentAssignment) {
  return record.origin === 'GAME_CLIENT' && record.actorId === record.memberId
}
const ORIGIN_LABELS: Record<EquipmentAssignment['origin'], string> = { INITIAL: 'Equipamento inicial', GUILD_DISTRIBUTION: 'Entrega da guild', GAME_CLIENT: 'Enviado pelo jogo' }
function originLabel(origin?: EquipmentAssignment['origin']) { return origin ? ORIGIN_LABELS[origin] : '' }
function gradeLabel(grade: number) { return grade === 3 ? 'Type C' : grade === 1 ? 'Intense' : catalogGradeLabel(grade) }
function memberScore(member: MemberEquipment) { return member.gearScore ? `${member.gearScore.total.toLocaleString('pt-BR')} GS${member.gearScore.unscored ? ' · parcial' : ''}` : 'GS indisponível' }
function itemScore(item: CurrentSlot['assignment']) { return item?.gearScore?.included === false ? 'Fora do GS' : item?.gearScore?.points != null ? `${item.gearScore.points.toLocaleString('pt-BR')} GS${item.gearScore.originalLevel != null ? ` · base Lv. ${item.gearScore.originalLevel}` : ''}` : 'GS pendente de classificação' }
const TYPE_C_LEVELS = [{ base: 43, required: 38 }, { base: 45, required: 40 }, { base: 47, required: 42 }, { base: 50, required: 45 }]
const SLOT_COUNT = EQUIPMENT_GROUPS.reduce((total, group) => total + group.slots.length, 0)

function itemLabel(item: Pick<EquipmentItem, 'name' | 'level' | 'grade'>) {
  return `Lv. ${item.level} · ${item.name} · ${gradeLabel(item.grade)}`
}
function today() { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) }
const STATUS_LABELS = { ACTIVE: 'Válido', CANCELLED: 'Cancelado', CORRECTED: 'Corrigido', TRANSFERRED: 'Repassado' }
const ACTION_LABELS = { CREATE: 'Registrar equipamento', EQUIP: 'Equipar do histórico', CORRECT: 'Corrigir registro', CANCEL: 'Cancelar registro', TRANSFER: 'Enviar equipamento' }
interface Editor { memberId: number; nickname: string; position: CurrentSlot; action: EquipmentOperation['action']; original?: EquipmentAssignment; delivery?: boolean }
interface DragTransfer { operation: EquipmentOperation; source: Editor; recipient: string; destination: CurrentSlot }

const SLOT_POSITIONS: Record<EquipmentSlot, string> = {
  Helmet: 'helmet', Upper: 'upper', Lower: 'lower', Gloves: 'gloves', Shoes: 'shoes',
  Weapon: 'weapon', Weapon2: 'weapon2', Cloak: 'cloak', Amulet1: 'amulet1', Amulet2: 'amulet2', Ring1: 'ring1', Ring2: 'ring2',
}
const SLOT_LABELS: Record<EquipmentSlot, string> = {
  Weapon: 'Arma', Weapon2: 'Arma', Helmet: 'Helmet', Upper: 'Upper', Lower: 'Lower',
  Gloves: 'Gloves', Shoes: 'Shoes', Amulet1: 'Amuleto', Amulet2: 'Amuleto', Ring1: 'Anel', Ring2: 'Anel', Cloak: 'Cloak',
}

const SLOT_SIDES: Partial<Record<EquipmentSlot, string>> = { Weapon: 'à esquerda', Weapon2: 'à direita', Amulet1: 'à esquerda', Amulet2: 'à direita', Ring1: 'à esquerda', Ring2: 'à direita' }
function slotDescription(slot: EquipmentSlot) { return `${SLOT_LABELS[slot]}${SLOT_SIDES[slot] ? ` ${SLOT_SIDES[slot]}` : ''}` }

function WeaponLevelInput({ value, onChange }: { value?: number; onChange: (level?: number) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const input = ref.current
    if (!input) return
    const wheel = (event: WheelEvent) => {
      if (event.deltaY === 0) return
      event.preventDefault()
      onChange(Math.max(35, Math.min(50, (value ?? 35) + (event.deltaY < 0 ? 1 : -1))))
    }
    input.addEventListener('wheel', wheel, { passive: false })
    return () => input.removeEventListener('wheel', wheel)
  }, [value, onChange])
  return <label>Nível da arma<input ref={ref} type="number" min={35} max={50} step={1} placeholder="35–50 · todos" value={value ?? ''}
    aria-invalid={value !== undefined && (!Number.isInteger(value) || value < 35 || value > 50)}
    onChange={e => onChange(e.target.value === '' ? undefined : e.target.valueAsNumber)} /></label>
}

export function EquipmentPage() {
  const { data: members = [], isLoading, error, refetch } = useEquipment()
  const { data: imported } = useEquipmentImportStatus()
  const { hasRole, user } = useAuthContext()
  const admin = hasRole('ADMINISTRADOR')
  const [pageView, setPageView] = useState<'mine' | 'manage'>('mine')
  const managing = pageView === 'manage'
  const { data: reviews = [], error: reviewLoadError } = useEquipmentReviews()
  const reviewAction = useEquipmentReviewAction()
  const ownReview = reviews.find(r => r.memberId === user?.memberId)
  const { showToast } = useAppToast()
  const transferMutation = useEquipmentOperation()
  const slotMutation = useEquipmentSlotEdit()
  const mutateSlots = slotMutation.mutateAsync
  const slotBusy = useRef(false)
  const [undoStack, setUndoStack] = useState<EquipmentSlotEditResult[]>([])
  const [redoStack, setRedoStack] = useState<EquipmentSlotEditResult[]>([])
  const [failedEdit, setFailedEdit] = useState<{ request: EquipmentSlotEdit; direction: 'remove' | 'undo' | 'redo' } | null>(null)
  const editSlots = useCallback(async (request: EquipmentSlotEdit, direction: 'remove' | 'undo' | 'redo') => {
    if (slotBusy.current) return
    slotBusy.current = true
    try {
      const result = await mutateSlots(request)
      setFailedEdit(null)
      if (direction === 'undo') { setUndoStack(s => s.slice(0, -1)); setRedoStack(s => [...s, result]) }
      else if (direction === 'redo') { setRedoStack(s => s.slice(0, -1)); setUndoStack(s => [...s, result]) }
      else { setUndoStack(s => [...s, result]); setRedoStack([]) }
      showToast(direction === 'undo' ? 'Remoção desfeita.' : direction === 'redo' ? 'Remoção refeita.' : request.slots.length > 1 ? 'Equipamentos removidos. Ctrl+Z para desfazer.' : 'Equipamento removido. Ctrl+Z para desfazer.', 'success')
    } catch { setFailedEdit({ request, direction }) }
    finally { slotBusy.current = false }
  }, [mutateSlots, showToast])
  const reverseEdit = useCallback((entry: EquipmentSlotEditResult, direction: 'undo' | 'redo') => {
    void editSlots({ operationId: crypto.randomUUID(), memberId: entry.memberId,
      slots: entry.slots.map(s => ({ slot: s.slot, expectedVersion: s.version })), reversesOperationId: entry.operationId }, direction)
  }, [editSlots])
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.repeat || event.defaultPrevented || event.key.toLowerCase() !== 'z' || slotMutation.isPending || failedEdit) return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('textarea,select,input:not([type=checkbox]):not([type=radio])'))) return
      const stack = event.shiftKey ? redoStack : undoStack
      const entry = stack.at(-1)
      if (!entry) return
      event.preventDefault(); reverseEdit(entry, event.shiftKey ? 'redo' : 'undo')
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [undoStack, redoStack, slotMutation.isPending, failedEdit, reverseEdit])
  const sendingTransfer = useRef(false)
  const [selectedMembers, setSelectedMembers] = useState<Set<number>>(new Set())
  const [onlySelected, setOnlySelected] = useState(false)
  const [dragged, setDragged] = useState<Editor | null>(null)
  const dragSource = useRef<Editor | null>(null)
  const [pendingTransfer, setPendingTransfer] = useState<DragTransfer | null>(null)
  const [tooltip, setTooltip] = useState<{ memberId: number; slot: EquipmentSlot; left: number; top?: number; bottom?: number } | null>(null)
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const keepTooltip = () => clearTimeout(tooltipTimer.current)
  const closeTooltip = () => { keepTooltip(); setTooltip(null) }
  const hideTooltip = () => { keepTooltip(); tooltipTimer.current = setTimeout(() => setTooltip(null), 120) }
  const showTooltip = (target: HTMLElement, memberId: number, slot: EquipmentSlot) => {
    if (dragSource.current) return
    keepTooltip()
    const bounds = target.getBoundingClientRect()
    const width = Math.min(320, window.innerWidth - 16)
    setTooltip({ memberId, slot, left: Math.max(8, Math.min(bounds.left, window.innerWidth - width - 8)),
      ...(bounds.top > window.innerHeight / 2 ? { bottom: window.innerHeight - bounds.top + 8 } : { top: bounds.bottom + 8 }) })
  }
  useEffect(() => {
    const dismiss = () => { clearTimeout(tooltipTimer.current); setTooltip(null) }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') dismiss() }
    window.addEventListener('scroll', dismiss, true)
    window.addEventListener('resize', dismiss)
    window.addEventListener('keydown', key)
    return () => { clearTimeout(tooltipTimer.current); window.removeEventListener('scroll', dismiss, true); window.removeEventListener('resize', dismiss); window.removeEventListener('keydown', key) }
  }, [])
  const tooltipItem = tooltip ? members.find(m => m.memberId === tooltip.memberId)?.slots.find(s => s.slot === tooltip.slot)?.assignment : null
  const [search, setSearch] = useState('')
  const [filled, setFilled] = useState(false)
  const [sort, setSort] = useState('gs-desc')
  const [playerClass, setPlayerClass] = useState('')
  const [historyId, setHistoryId] = useState(0)
  const [selectedSlot, setSelectedSlot] = useState<EquipmentSlot>('Weapon')
  const [tab, setTab] = useState<'current' | 'previous' | 'history' | 'deliveries'>('current')
  const [editor, setEditor] = useState<Editor | null>(null)
  const { data: history = [], isLoading: historyLoading, error: historyError, refetch: refetchHistory } = useEquipmentHistory(managing ? historyId : user?.memberId ?? 0, admin)
  const inspected = members.find(m => m.memberId === (managing ? historyId : user?.memberId))
  const previousItems = admin ? history.filter(r => r.status === 'ACTIVE' && !r.deliveryOnly && !inspected?.slots.some(s => s.assignment?.id === r.id)) : []
  const deliveryTotals = summarizeDeliveries(admin ? history : [])
  // Histórico mostra só o que a administração registrou: a sincronização do jogo (feita pelo próprio membro) fica de fora.
  const visibleHistory = history.filter(r => tab === 'deliveries' ? isGuildDelivery(r) : !r.deliveryOnly && !isGameClientSync(r))
  const inspectedReview = reviews.find(r => r.memberId === inspected?.memberId)
  const position = inspected?.slots.find(s => s.slot === selectedSlot)
  const item = position?.assignment
  const inspectRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (historyId) {
      if (window.matchMedia?.('(max-width: 1400px)').matches) inspectRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
      inspectRef.current?.focus({ preventScroll: true })
    }
  }, [historyId])
  const canEdit = admin || inspected?.memberId === user?.memberId
  const filteringSelection = onlySelected && selectedMembers.size > 0
  const filtered = members.filter(m => m.nickname.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) && (!playerClass || playerClassForEquipmentList(m.className ?? undefined) === playerClass) && (!filled || m.slots.some(s => s.assignment)) && (!filteringSelection || selectedMembers.has(m.memberId)))
    .sort((a, b) => (sort === 'gs-asc' ? (a.gearScore?.total ?? 0) - (b.gearScore?.total ?? 0) : sort === 'gs-desc' ? (b.gearScore?.total ?? 0) - (a.gearScore?.total ?? 0) : sort === 'name-desc' ? b.nickname.localeCompare(a.nickname, 'pt-BR', { sensitivity: 'base' }) : sort === 'level-asc' ? a.level - b.level : sort === 'level-desc' ? b.level - a.level : 0) || a.nickname.localeCompare(b.nickname, 'pt-BR', { sensitivity: 'base' }) || a.memberId - b.memberId)
  const acceptsDrop = (memberId: number, slot?: EquipmentSlot, source = dragged) => !!(admin && source && source.memberId !== memberId && !transferMutation.isPending && (!slot || slot === source.position.slot ||
    (['RING', 'AMULET'].includes(SLOT_CATEGORY[source.position.slot]) && SLOT_CATEGORY[slot] === SLOT_CATEGORY[source.position.slot])))
  const sendTransfer = async (request: DragTransfer) => {
    if (sendingTransfer.current) return
    sendingTransfer.current = true
    try { await transferMutation.mutateAsync(request.operation); setPendingTransfer(null); showToast('Equipamento enviado.', 'success') }
    catch { setPendingTransfer(request) }
    finally { sendingTransfer.current = false }
  }
  const requestTransfer = (source: Editor, member: MemberEquipment, slot?: EquipmentSlot) => {
    if (sendingTransfer.current || !source || !acceptsDrop(member.memberId, slot, source)) return
    const targetSlot = slot ?? source.position.slot
    const destination = member.slots.find(s => s.slot === targetSlot)
    if (!destination) return
    const request: DragTransfer = { source, recipient: member.nickname, destination, operation: {
      operationId: crypto.randomUUID(), action: 'TRANSFER', memberId: source.memberId,
      slot: source.position.slot, expectedVersion: source.position.version, useAsCurrent: false,
      ...(source.original ? { assignmentId: source.original.id } : {}),
      transfer: { memberId: member.memberId, slot: targetSlot, expectedVersion: destination.version, replaceCurrent: !!destination.assignment },
    } }
    dragSource.current = null; setDragged(null)
    if (destination.assignment) setPendingTransfer(request)
    else void sendTransfer(request)
  }
  const dropOn = (member: MemberEquipment, slot?: EquipmentSlot) => {
    const source = dragSource.current
    if (source) requestTransfer(source, member, slot)
  }
  const inspect = (id: number, slot: EquipmentSlot = 'Weapon', edit = false) => {
    setHistoryId(id); setSelectedSlot(slot); setTab('current'); setEditor(null)
    const member = members.find(m => m.memberId === id)
    const target = member?.slots.find(s => s.slot === slot)
    if (edit && member && target && (admin || id === user?.memberId)) setEditor({ memberId: id, nickname: member.nickname, position: target, action: 'CREATE' })
    if (id === historyId) inspectRef.current?.focus({ preventScroll: true })
  }
  const openEditor = (slot: EquipmentSlot, action: Editor['action'], original?: EquipmentAssignment) => {
    if (!canEdit) return
    const target = inspected?.slots.find(s => s.slot === slot)
    if (inspected && target) {
      setSelectedSlot(slot); setTab('current')
      setEditor({ memberId: inspected.memberId, nickname: inspected.nickname, position: target, action, original })
    }
  }
  const registerDelivery = (member: MemberEquipment) => {
    if (!admin) return
    const position = member.slots.find(s => s.slot === 'Weapon')
    if (!position) return
    setHistoryId(member.memberId); setSelectedSlot('Weapon'); setTab('current')
    setEditor({ memberId: member.memberId, nickname: member.nickname, position, action: 'CREATE', delivery: true })
  }
  const removeItems = (member: MemberEquipment, slot?: EquipmentSlot) => {
    if (slotBusy.current || failedEdit || (!admin && member.memberId !== user?.memberId)) return
    const slots = member.slots.filter(s => s.assignment && (!slot || s.slot === slot))
    if (!slots.length) return
    closeTooltip(); setEditor(null)
    void editSlots({ operationId: crypto.randomUUID(), memberId: member.memberId,
      slots: slots.map(s => ({ slot: s.slot, expectedVersion: s.version })) }, 'remove')
  }
  const excluded = JSON.parse(imported?.excluded ?? '[]') as { category: string; gameCode: string; reason: string }[]
  return <div className="equipment-page">
    <header className="equipment-page__heading">
      <div><h1>{managing ? 'Equipamentos da guild' : 'Meus equipamentos'}</h1></div>
      <Button variant="secondary" onClick={() => { void refetch(); if (historyId) void refetchHistory() }}>Atualizar</Button>
    </header>
    <div className="equipment-tabs" role="group" aria-label="Área de equipamentos">
      <Button variant={managing ? 'secondary' : 'primary'} aria-pressed={!managing} onClick={() => { setPageView('mine'); setEditor(null); setTab('current') }}>Meus equipamentos</Button>
      <Button variant={managing ? 'primary' : 'secondary'} aria-pressed={managing} onClick={() => { setPageView('manage'); setEditor(null); setTab('current') }}>{admin ? 'Gerenciar players' : 'Ver jogadores'}</Button>
    </div>
    {(reviewAction.error || reviewLoadError) && <p role="alert">{reviewAction.error?.message ?? reviewLoadError?.message}</p>}
    {!managing && <div className="equipment-actions">
      {ownReview && <span>{ownReview.status === 'CONFIRMED' ? 'Revisão confirmada' : ownReview.overdue ? 'Revisão em atraso' : 'Revisão pendente'} · Prazo: {new Date(ownReview.dueAt).toLocaleString('pt-BR')}</span>}
      {ownReview && ownReview.status !== 'CONFIRMED' && <Button disabled={reviewAction.isPending} onClick={() => reviewAction.mutate({ confirmId: ownReview.id })}>Revisei meus equipamentos</Button>}
      <Button size="sm" variant="secondary" disabled={!undoStack.length || slotMutation.isPending || !!failedEdit} onClick={() => { const entry = undoStack.at(-1); if (entry) reverseEdit(entry, 'undo') }}>Desfazer</Button>
      <Button size="sm" variant="secondary" disabled={!redoStack.length || slotMutation.isPending || !!failedEdit} onClick={() => { const entry = redoStack.at(-1); if (entry) reverseEdit(entry, 'redo') }}>Refazer</Button>
      {inspected && <Button size="sm" variant="danger" disabled={!inspected.slots.some(s => s.assignment) || slotMutation.isPending || !!failedEdit} onClick={() => removeItems(inspected)}>Limpar meus equipamentos</Button>}
      {isLoading && <p role="status">Carregando equipamentos…</p>}
      {error && <p role="alert">{error.message}</p>}
      {failedEdit && <div role="alert">{slotMutation.error?.message ?? 'Não foi possível concluir a alteração.'}<Button onClick={() => void editSlots(failedEdit.request, failedEdit.direction)}>Tentar novamente</Button><Button onClick={() => setFailedEdit(null)}>Fechar aviso</Button></div>}
    </div>}
    <div className={`equipment-workspace${managing && inspected ? ' equipment-workspace--split' : ''}`}>
    {managing && <Panel className="equipment-workspace__roster" title="Personagens" code={`${members.length} PERSONAGENS`}>
      <div className="equipment-toolbar">
        <label>Pesquisar personagem<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nick do personagem" /></label>
        <div className="equipment-player-classes" role="group" aria-label="Classe do personagem"><span>Classe</span><div>{(['MELEE', 'RANGER', 'FORCE'] as const).map(value => <Button key={value} size="sm" variant="secondary" aria-pressed={playerClass === value} onClick={() => setPlayerClass(current => current === value ? '' : value)}>{value}</Button>)}</div></div>
        <label>Ordenar jogadores<select value={sort} onChange={e => setSort(e.target.value)}><option value="name">Nome · A–Z</option><option value="name-desc">Nome · Z–A</option><option value="gs-desc">Gear score decrescente</option><option value="gs-asc">Gear score crescente</option><option value="level-asc">Nível crescente</option><option value="level-desc">Nível decrescente</option></select></label>
        <label className="equipment-check"><input type="checkbox" checked={filled} onChange={e => setFilled(e.target.checked)} />Somente com equipamento informado</label>
        <label className="equipment-check"><input type="checkbox" checked={filteringSelection} disabled={selectedMembers.size === 0} onChange={e => setOnlySelected(e.target.checked)} />Somente selecionados ({selectedMembers.size})</label>
        {selectedMembers.size > 0 && <Button size="sm" variant="secondary" onClick={() => { setSelectedMembers(new Set()); setOnlySelected(false) }}>Limpar seleção</Button>}
        <Button size="sm" variant="secondary" disabled={!undoStack.length || slotMutation.isPending || !!failedEdit} title="Ctrl+Z" onClick={() => { const entry = undoStack.at(-1); if (entry) reverseEdit(entry, 'undo') }}>Desfazer</Button>
        <Button size="sm" variant="secondary" disabled={!redoStack.length || slotMutation.isPending || !!failedEdit} title="Ctrl+Shift+Z" onClick={() => { const entry = redoStack.at(-1); if (entry) reverseEdit(entry, 'redo') }}>Refazer</Button>
      </div>
      {isLoading && <p role="status">Carregando equipamentos…</p>}
      {error && <p role="alert">{error.message}</p>}
      {transferMutation.error && <p role="alert">{transferMutation.error.message} Atualize os equipamentos se houver conflito.</p>}
      {failedEdit && <div role="alert"><p>{slotMutation.error?.message ?? 'Não foi possível concluir a alteração.'}</p><div className="equipment-actions"><Button size="sm" onClick={() => void editSlots(failedEdit.request, failedEdit.direction)}>Tentar novamente</Button><Button size="sm" variant="secondary" onClick={() => setFailedEdit(null)}>Fechar aviso</Button></div></div>}
      {transferMutation.isPending && <p role="status">Enviando equipamento…</p>}
      {!isLoading && !error && <>
        <div className={`equipment-roster__header${admin ? ' equipment-roster__header--admin' : ''}`} aria-hidden="true"><span>Personagem</span><span>Armas</span><span>Armaduras</span><span>Acessórios</span><span>Ações</span></div>
        <ul className="equipment-roster" aria-label="Equipamentos dos personagens">{filtered.map(member => <li key={member.memberId} className={`equipment-roster__row${admin ? ' equipment-roster__row--admin' : ''}${member.memberId === historyId ? ' is-selected' : ''}${selectedMembers.has(member.memberId) ? ' is-checked' : ''}${acceptsDrop(member.memberId) ? ' is-drop-target' : ''}`}
          onDragOver={e => { if (acceptsDrop(member.memberId, undefined, dragSource.current)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' } }}
          onDrop={e => { e.preventDefault(); dropOn(member) }}>
          <div className="equipment-roster__member"><input type="checkbox" aria-label={`Selecionar ${member.nickname}`} checked={selectedMembers.has(member.memberId)} onChange={e => {
            const checked = e.target.checked
            if (!checked && selectedMembers.size === 1) setOnlySelected(false)
            setSelectedMembers(previous => { const next = new Set(previous); if (checked) next.add(member.memberId); else next.delete(member.memberId); return next })
          }} /><span className="equipment-roster__class" tabIndex={0} title={member.className ?? 'Classe não informada'}>{member.classImageUrl && member.className ? <MemberClassIcon classImageUrl={member.classImageUrl} classLabel={member.className} /> : <span className="equipment-roster__class-fallback" role="img" aria-label={member.className ?? 'Classe não informada'}>?</span>}</span><div className="equipment-roster__summary"><button className="equipment-nick-link" title={member.nickname} onClick={() => inspect(member.memberId)}>{member.nickname}</button><strong className="equipment-roster__score" title={memberScore(member)}>{memberScore(member)}</strong><small>Lv. {member.level} · {member.expPercent != null ? `${member.expPercent.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% XP` : 'EXP não informada'}</small></div></div>
          {EQUIPMENT_GROUPS.map(group => <div key={group.id} className="equipment-roster__group" role="group" aria-label={`${group.label} de ${member.nickname}`}>
            <span className="equipment-roster__label">{group.label}</span>
            <div className="equipment-mini-slots">{group.slots.map(slot => {
              const current = member.slots.find(s => s.slot === slot)?.assignment
              const label = `${slotDescription(slot)} de ${member.nickname}: ${current ? `${itemLabel(current)} · ${effectLabel(current.effect)}` : 'Não informado'}`
              return <div key={slot} className="equipment-mini-slot-wrap"
                onDragOver={e => { e.stopPropagation(); if (acceptsDrop(member.memberId, slot, dragSource.current)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' } }}
                onDrop={e => { e.preventDefault(); e.stopPropagation(); dropOn(member, slot) }}><button className={`equipment-mini-slot equipment-slot--${SLOT_POSITIONS[slot]}${current ? ' is-filled' : ''}${acceptsDrop(member.memberId, slot) ? ' can-drop' : ''}`} title={current ? undefined : label} aria-label={label}
                aria-describedby={tooltipItem && tooltip?.memberId === member.memberId && tooltip.slot === slot ? 'equipment-item-tooltip' : undefined}
                onMouseEnter={e => { if (current) showTooltip(e.currentTarget, member.memberId, slot) }} onMouseLeave={hideTooltip}
                onFocus={e => { if (current) showTooltip(e.currentTarget, member.memberId, slot) }} onBlur={closeTooltip}
                draggable={admin && !!current && !transferMutation.isPending}
                onDragStart={e => {
                  closeTooltip()
                  const position = member.slots.find(s => s.slot === slot)
                  if (!admin || !current || !position || sendingTransfer.current) { e.preventDefault(); return }
                  e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', current.name)
                  const source: Editor = { memberId: member.memberId, nickname: member.nickname, position, action: 'TRANSFER' }
                  dragSource.current = source; setDragged(source)
                }} onDragEnd={() => { dragSource.current = null; setDragged(null) }}

                onClick={() => { closeTooltip(); inspect(member.memberId, slot, true) }}>
                {current ? <EquipmentIcon item={current} size={36} /> : <EmptyEquipmentSlot category={SLOT_CATEGORY[slot]} />}
              </button>{current && (admin || member.memberId === user?.memberId) && <button type="button" className="equipment-mini-remove" aria-label={`Remover ${slotDescription(slot)} de ${member.nickname}`} title="Remover equipamento" disabled={slotMutation.isPending || !!failedEdit} onClick={() => removeItems(member, slot)}>×</button>}</div>
            })}</div>
          </div>)}
          <div className="equipment-roster__actions">{admin && <Button size="sm" variant="secondary" aria-label={`Registrar entrega para ${member.nickname}`} onClick={() => registerDelivery(member)}>Registrar entrega</Button>}{(admin || member.memberId === user?.memberId) && <Button size="sm" variant="danger" aria-label={`Limpar equipamentos de ${member.nickname}`} disabled={!member.slots.some(s => s.assignment) || slotMutation.isPending || !!failedEdit} onClick={() => removeItems(member)}>Limpar</Button>}<Button size="sm" variant="secondary" aria-label={`Inspecionar ${member.nickname}`} onClick={() => inspect(member.memberId)}>Ver</Button></div>
        </li>)}</ul>
        {filtered.length === 0 && <p>Nenhum personagem encontrado com esses filtros.</p>}
      </>}
      <details className="equipment-catalog-note"><summary>Catálogo e critérios de seleção</summary>
        <p>Armas: grades B/C, níveis 35–50, incluindo todas as variantes rebaixadas. Armaduras: níveis 35–55, grades B/C e os rebaixamentos definidos. Acessórios: Elemental utilizáveis por Cora e anéis com os bônus permitidos. Cloak: Ether Wing 40 e Advanced Ether Wing 50 de Cora.</p>
        <p>Prévias dos DDS do cliente; associação visual ainda não confirmada no jogo. “?” indica ausência de prévia.</p>
        {imported?.imported_count ? <><p>{imported.imported_count.toLocaleString('pt-BR')} modelos importados, antes do filtro de grades.</p><p>{excluded.length} códigos bloqueados por inconsistência na fonte.</p><ul>{excluded.map(i => <li key={`${i.category}-${i.gameCode}`}>{i.gameCode} · {i.category} · {i.reason}</li>)}</ul></> : <p role="status">Catálogo ainda não importado.</p>}
      </details>
    </Panel>}
    <ConfirmDialog open={!!pendingTransfer} title="Enviar equipamento" confirmLabel="Confirmar envio" loading={transferMutation.isPending} onCancel={() => setPendingTransfer(null)} onConfirm={() => { if (pendingTransfer) void sendTransfer(pendingTransfer) }}>
      {pendingTransfer?.source.position.assignment && <><p><strong>{pendingTransfer.source.nickname} → {pendingTransfer.recipient}</strong></p>
        <div className="equipment-item-preview"><EquipmentIcon item={pendingTransfer.source.position.assignment} size={40} /><span>{itemLabel(pendingTransfer.source.position.assignment)} · {effectLabel(pendingTransfer.source.position.assignment.effect)}</span></div>
        <p>{slotDescription(pendingTransfer.destination.slot)}: {pendingTransfer.destination.assignment ? `${itemLabel(pendingTransfer.destination.assignment)} será preservado no histórico.` : 'posição vazia'}</p>
        {transferMutation.error && <p role="alert">{transferMutation.error.message}</p>}</>}
    </ConfirmDialog>
    {inspected && <Panel className="equipment-workspace__inspection" aria-label={`Equipamentos de ${inspected.nickname}`} title={managing ? "Inspecionar personagem" : "Meu inventário"} code={`${inspected.slots.filter(s => s.assignment).length}/${SLOT_COUNT} INFORMADOS`}>
      <div className="equipment-page__heading"><h2 ref={inspectRef} tabIndex={-1}>{inspected.nickname} · {memberScore(inspected)}</h2>{managing && <Button variant="secondary" onClick={() => { setHistoryId(0); setEditor(null) }}>Fechar inspeção</Button>}</div>
      {managing && <div className="equipment-inspection-summary">
        {inspected.classImageUrl && inspected.className && <MemberClassIcon classImageUrl={inspected.classImageUrl} classLabel={inspected.className} size="sm" />}
        <span>Lv. {inspected.level}{inspected.expPercent != null ? ` · ${inspected.expPercent.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% XP` : ''} · {inspected.className ?? 'Classe não informada'}</span>
      </div>}
      {inspected.gearScore && <small title="Itens +0. Arma ×5 (somente a maior), armaduras ×1, acessórios ×3. Capa fora do cálculo.">Arma: {inspected.gearScore.weapon.toLocaleString('pt-BR')} · Armaduras: {inspected.gearScore.armor.toLocaleString('pt-BR')} · Acessórios: {inspected.gearScore.accessories.toLocaleString('pt-BR')}{inspected.gearScore.unscored > 0 && ` · ${inspected.gearScore.unscored} item(ns) sem pontuação confirmada`}</small>}
      {admin && <div className="equipment-actions">
        <Button size="sm" onClick={() => registerDelivery(inspected)}>Registrar entrega</Button>
        {managing && <Button size="sm" variant="danger" aria-label={`Limpar todos os equipamentos de ${inspected.nickname}`} disabled={!inspected.slots.some(s => s.assignment) || slotMutation.isPending || !!failedEdit} onClick={() => removeItems(inspected)}>Limpar</Button>}
        <Button size="sm" variant="secondary" disabled={reviewAction.isPending || (!!inspectedReview && inspectedReview.status !== 'CONFIRMED')} onClick={() => reviewAction.mutate({ memberId: inspected.memberId, operationId: crypto.randomUUID() })}>Solicitar revisão · 72h</Button>
        {inspectedReview && <small>{inspectedReview.status === 'OVERDUE' ? 'Revisão em atraso' : inspectedReview.status === 'PENDING' ? 'Revisão pendente' : 'Revisado'} · {new Date(inspectedReview.dueAt).toLocaleString('pt-BR')}</small>}
      </div>}
      {admin && <div className="equipment-tabs" role="tablist" aria-label="Consulta do personagem" onKeyDown={e => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
        e.preventDefault()
        const tabs = ['current', 'previous', 'history', 'deliveries'] as const
        const next = e.key === 'Home' ? 'current' : e.key === 'End' ? 'deliveries' : tabs[(tabs.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]
        setTab(next); document.getElementById(`equipment-${next}-tab`)?.focus()
      }}>
        <button id="equipment-current-tab" role="tab" tabIndex={tab === 'current' ? 0 : -1} aria-selected={tab === 'current'} aria-controls="equipment-current-panel" onClick={() => setTab('current')}>Equipamento atual</button>
        <button id="equipment-previous-tab" role="tab" tabIndex={tab === 'previous' ? 0 : -1} aria-selected={tab === 'previous'} aria-controls="equipment-previous-panel" onClick={() => { setTab('previous'); setEditor(null) }}>Itens anteriores{!historyLoading && !historyError ? ` (${previousItems.length})` : ''}</button>
        <button id="equipment-history-tab" role="tab" tabIndex={tab === 'history' ? 0 : -1} aria-selected={tab === 'history'} aria-controls="equipment-history-panel" onClick={() => setTab('history')}>Histórico</button>
        <button id="equipment-deliveries-tab" role="tab" tabIndex={tab === 'deliveries' ? 0 : -1} aria-selected={tab === 'deliveries'} aria-controls="equipment-deliveries-panel" onClick={() => setTab('deliveries')}>Itens entregues</button>
      </div>}
      {tab === 'current' || !admin ? <div id="equipment-current-panel" role={admin ? 'tabpanel' : 'region'} aria-labelledby={admin ? 'equipment-current-tab' : undefined} aria-label={admin ? undefined : 'Equipamento atual'} className="equipment-inspector">
        <div>
          <div className="equipment-inventory" role="group" aria-label={`Inventário de ${inspected.nickname}`}>
            {inspected.slots.map(current => <button key={current.slot} type="button" className={`equipment-inventory__slot equipment-slot--${SLOT_POSITIONS[current.slot]}${selectedSlot === current.slot ? ' is-selected' : ''}`} aria-pressed={selectedSlot === current.slot} aria-label={`${slotDescription(current.slot)}: ${current.assignment ? itemLabel(current.assignment) : 'Não informado'}`} onClick={() => { if (canEdit) openEditor(current.slot, 'CREATE'); else { setSelectedSlot(current.slot); setEditor(null) } }}>
              {current.assignment ? <EquipmentIcon item={current.assignment} size={48} /> : <span className="equipment-inventory__empty" aria-hidden="true">+</span>}
              <span>{SLOT_LABELS[current.slot]}</span>
            </button>)}
          </div>
          {canEdit && position?.assignment && <Button size="sm" variant="danger" onClick={() => removeItems(inspected, selectedSlot)} disabled={slotMutation.isPending || !!failedEdit}>Remover {slotDescription(selectedSlot)}</Button>}
        </div>
        <div className="equipment-inspector__details">
          {editor ? <>
            {editor.delivery && <label>Tipo do item entregue<select value={editor.position.slot} onChange={e => {
              const position = inspected.slots.find(s => s.slot === e.target.value)
              if (position) setEditor({ ...editor, position })
            }}>{(['Weapon', 'Helmet', 'Upper', 'Lower', 'Gloves', 'Shoes', 'Amulet1', 'Ring1', 'Cloak'] as const).map(slot => <option key={slot} value={slot}>{SLOT_LABELS[slot]}</option>)}</select></label>}
            <EquipmentEditor key={`${editor.memberId}-${editor.position.slot}-${editor.action}-${editor.original?.id ?? 'new'}-${editor.delivery ? 'delivery' : 'equipment'}`} editor={editor} members={members} onClose={() => setEditor(null)} onSaved={() => { if (editor.delivery) setTab('deliveries'); setEditor(null) }} />
          </> : <section aria-label="Detalhes da posição" aria-live="polite">
            <h3>{SLOT_LABELS[selectedSlot]}</h3>
            {item ? <><div className="equipment-item-preview"><EquipmentIcon item={item} size={64} /><div><strong>{itemLabel(item)}</strong><small>{item.gameCode}{admin && ` · Registro #${item.id}`}</small></div></div><p>{effectLabel(item.effect)} · {itemScore(item)}</p>{admin && <><p>{originLabel(item.origin)} · {item.occurredOn?.split('-').reverse().join('/')}</p><p>Registrado por {item.actorName}</p></>}</> : <p>Equipamento não informado nesta posição.</p>}
            {canEdit && <Button onClick={() => openEditor(selectedSlot, 'CREATE')}>Registrar em {SLOT_LABELS[selectedSlot]}</Button>}
          </section>}
        </div>
      </div> : tab === 'previous' ? <div id="equipment-previous-panel" role="tabpanel" aria-labelledby="equipment-previous-tab">
        {historyLoading && <p role="status">Carregando itens anteriores…</p>}
        {historyError && <p role="alert">{historyError.message}<Button size="sm" onClick={() => void refetchHistory()}>Tentar novamente</Button></p>}
        {!historyLoading && !historyError && <PreviousEquipment key={inspected.memberId} member={inspected} items={previousItems} members={members} busy={transferMutation.isPending}
          onDragStart={source => { closeTooltip(); dragSource.current = source; setDragged(source) }}
          onDragEnd={() => { dragSource.current = null; setDragged(null) }}
          onTransfer={requestTransfer} onDiscard={record => openEditor(record.slot, 'CANCEL', record)} />}
      </div> : <div id={`equipment-${tab}-panel`} role="tabpanel" aria-labelledby={`equipment-${tab}-tab`}>
        {tab === 'deliveries' && <section aria-label="Totais recebidos"><h3>Totais recebidos</h3>
          {deliveryTotals.length ? <ul className="equipment-delivery-totals">{deliveryTotals.map(total => {
            const slot = Object.keys(SLOT_CATEGORY).find(slot => SLOT_CATEGORY[slot as EquipmentSlot] === total.category) as EquipmentSlot
            return <li key={`${total.category}-${total.level}-${total.grade}`}><span>{SLOT_LABELS[slot]} · Lv. {total.level} · {total.grade === 1 ? 'B · Intense' : total.grade === 3 ? 'C · Type C' : gradeLabel(total.grade)}</span><strong>{total.count}</strong></li>
          })}</ul> : !historyLoading && !historyError && <p>Nenhuma entrega válida registrada.</p>}
        </section>}
        {historyLoading && <p role="status">Carregando histórico…</p>}{historyError && <p role="alert">{historyError.message}</p>}
        {!historyLoading && !historyError && visibleHistory.length === 0 && <p>Nenhum equipamento registrado para este personagem.</p>}
        <ul className="equipment-history" aria-label={tab === 'deliveries' ? 'Itens entregues' : 'Histórico de equipamentos'}>{visibleHistory.map(record => {
          const current = inspected.slots.find(s => s.slot === record.slot)?.assignment?.id === record.id
          return <li key={record.id}>
            <div className="equipment-history__heading"><div className="equipment-item-preview"><EquipmentIcon item={record} size={32} /><strong>{slotDescription(record.slot)} · {itemLabel(record)}</strong></div><span>{STATUS_LABELS[record.status]}{current && <strong className="equipment-current">Atual</strong>}</span></div>
            <small>{record.gameCode} · #{record.id}{record.correctsId ? ` · Corrige #${record.correctsId}` : ''}</small>
            <p>{effectLabel(record.effect)}</p>
            <p>{originLabel(record.origin)} · {record.occurredOn.split('-').reverse().join('/')} · {record.actorName}</p>
            <small>Registrado em {new Date(record.createdAt).toLocaleString('pt-BR')}</small>
            {record.reason && <p>Motivo: {record.reason}</p>}
            {record.statusReason && <p>Motivo da alteração: {record.statusReason}</p>}
            {record.statusActorName && <small>Por {record.statusActorName}{record.statusChangedAt ? ` · ${new Date(record.statusChangedAt).toLocaleString('pt-BR')}` : ''}</small>}
            {admin && record.status === 'ACTIVE' && <div className="equipment-actions">{!current && <Button size="sm" variant="secondary" onClick={() => openEditor(record.slot, 'EQUIP', record)}>Equipar</Button>}<Button size="sm" variant="secondary" onClick={() => openEditor(record.slot, 'CORRECT', record)}>Corrigir</Button><Button size="sm" variant="danger" onClick={() => openEditor(record.slot, 'CANCEL', record)}>Cancelar</Button></div>}
          </li>
        })}</ul>
      </div>}
      {(tab === 'current' || !admin) && <EquipmentRelics key={inspected.memberId} memberId={inspected.memberId} editable={admin} />}
    </Panel>}
    </div>
    {tooltip && tooltipItem && createPortal(<div id="equipment-item-tooltip" role="tooltip" className="equipment-tooltip" style={{ left: tooltip.left, top: tooltip.top, bottom: tooltip.bottom }} onMouseEnter={keepTooltip} onMouseLeave={hideTooltip}>
      <EquipmentIcon item={tooltipItem} size={48} /><div style={{ color: gradeColor(tooltipItem.grade) }}><strong>{tooltipItem.name}</strong><div className="equipment-tooltip__meta">Lv. {tooltipItem.level} · {gradeLabel(tooltipItem.grade)} · {itemScore(tooltipItem)}</div><p>{effectLabel(tooltipItem.effect)}</p></div>
    </div>, document.body)}
  </div>
}

function PreviousEquipment({ member, items, members, busy, onDragStart, onDragEnd, onTransfer, onDiscard }: {
  member: MemberEquipment; items: EquipmentAssignment[]; members: MemberEquipment[]; busy: boolean
  onDragStart: (source: Editor) => void; onDragEnd: () => void
  onTransfer: (source: Editor, recipient: MemberEquipment, slot?: EquipmentSlot) => void
  onDiscard: (record: EquipmentAssignment) => void
}) {
  const [sendingId, setSendingId] = useState<number | null>(null)
  const [recipientId, setRecipientId] = useState('')
  const [targetSlot, setTargetSlot] = useState<EquipmentSlot | ''>('')
  const sourceFor = (record: EquipmentAssignment): Editor => ({ memberId: member.memberId, nickname: member.nickname,
    position: { slot: record.slot, version: member.slots.find(s => s.slot === record.slot)?.version ?? 0, assignment: record }, action: 'TRANSFER', original: record })
  return <section aria-label="Disponíveis para repasse">
    <h3>Disponíveis para repasse</h3>
    {!items.length && <p>Nenhum item anterior disponível para repasse.</p>}
    <ul className="equipment-previous">{items.map(record => <li key={record.id}>
      <div className="equipment-previous__item">
        <button type="button" className="equipment-previous__drag" draggable={!busy} disabled={busy} aria-label={`Arrastar ou repassar ${record.name} · registro ${record.id}`}
          onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', record.name); onDragStart(sourceFor(record)) }} onDragEnd={onDragEnd}
          onClick={() => { setSendingId(record.id); setTargetSlot(record.slot) }}>
          <span aria-hidden="true">⠿</span><EquipmentIcon item={record} size={40} />
          <span style={{ color: gradeColor(record.grade) }}><strong>{record.name}</strong><span>Lv. {record.level} · {gradeLabel(record.grade)}</span><span>{effectLabel(record.effect)}</span></span>
        </button>
        <Button size="sm" variant="danger" disabled={busy} aria-label={`Descartar ${record.name} · registro ${record.id}`} onClick={() => onDiscard(record)}>×</Button>
      </div>
      <small>{slotDescription(record.slot)} · Registrado em {new Date(record.createdAt).toLocaleString('pt-BR')}</small>
      {sendingId === record.id && <form className="equipment-previous__send" aria-label={`Repassar ${record.name}`} onSubmit={e => {
        e.preventDefault(); const recipient = members.find(m => String(m.memberId) === recipientId)
        if (recipient) onTransfer(sourceFor(record), recipient, targetSlot || record.slot)
      }}>
        <label>Destinatário<select required value={recipientId} disabled={busy} onChange={e => setRecipientId(e.target.value)}><option value="">Selecione o player</option>{members.filter(m => m.memberId !== member.memberId).map(m => <option key={m.memberId} value={m.memberId}>{m.nickname}</option>)}</select></label>
        {['RING', 'AMULET'].includes(record.category) && <label>Posição<select value={targetSlot} disabled={busy} onChange={e => setTargetSlot(e.target.value as EquipmentSlot)}>{EQUIPMENT_GROUPS.flatMap(g => g.slots).filter(slot => SLOT_CATEGORY[slot] === record.category).map(slot => <option key={slot} value={slot}>{slotDescription(slot)}</option>)}</select></label>}
        <Button type="submit" size="sm" disabled={busy || !recipientId}>Enviar</Button>
      </form>}
    </li>)}</ul>
  </section>
}

type EquipmentEditorProps = { editor: Editor; members: MemberEquipment[]; onClose: () => void; onSaved: () => void }
const WEAPON_TYPE_LABELS: Record<number, string> = { 0: 'Faca', 1: 'Espada', 2: 'Machado', 3: 'Maça', 4: 'Lança', 5: 'Arco', 6: 'Arma de fogo', 7: 'Lançador', 8: 'Faca de arremesso', 9: 'Cajado', 10: 'Ferramenta de mineração', 11: 'Lança-granadas' }
function EquipmentEditor(props: EquipmentEditorProps) {
  const { hasRole } = useAuthContext()
  const useCharacterClass = ['CREATE', 'CORRECT'].includes(props.editor.action) && (['Weapon', 'Weapon2'].includes(props.editor.position.slot) || (hasRole('ADMINISTRADOR') && ['Helmet', 'Upper', 'Lower', 'Gloves', 'Shoes'].includes(props.editor.position.slot)))
  const profile = useMember(useCharacterClass ? props.editor.memberId : 0)
  if (useCharacterClass && profile.isLoading) return <p role="status">Carregando classe do personagem…</p>
  if (useCharacterClass && profile.error) return <div role="alert">{profile.error.message}<Button onClick={() => void profile.refetch()}>Tentar novamente</Button><Button variant="secondary" onClick={props.onClose}>Fechar</Button></div>
  return <EquipmentEditorForm {...props} initialClass={useCharacterClass ? (SLOT_CATEGORY[props.editor.position.slot] === 'WEAPON' ? weaponClassForCharacter : armorClassForCharacter)(profile.data?.className) : undefined} />
}
function EquipmentEditorForm({ editor, members, onClose, onSaved, initialClass }: EquipmentEditorProps & { initialClass?: CatalogFilters['equipmentClass'] }) {
  const { showToast } = useAppToast()
  const formRef = useRef<HTMLFormElement>(null)
  useEffect(() => {
    formRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
    formRef.current?.querySelector<HTMLElement>('input,select,textarea,button')?.focus({ preventScroll: true })
  }, [])
  const { user, hasRole } = useAuthContext()
  const admin = hasRole('ADMINISTRADOR')
  const mutation = useEquipmentOperation()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const category = SLOT_CATEGORY[editor.position.slot]
  const weapon = category === 'WEAPON'
  const accessory = category === 'RING' || category === 'AMULET'
  const cloak = category === 'CLOAK'
  const restricted = accessory || cloak
  const [filters, setFilters] = useState<CatalogFilters>({ race: 'CORA', ...(restricted ? {} : { grade: weapon && !editor.delivery && editor.position.assignment?.grade === 1 ? 1 : 3 }), ...(weapon ? { level: (!editor.delivery ? editor.position.assignment?.level : undefined) ?? 45 } : {}), ...(initialClass ? { equipmentClass: initialClass } : {}) })
  const validLevel = !weapon || filters.level === undefined || (Number.isInteger(filters.level) && filters.level >= 35 && filters.level <= 50)
  const [autoResolve, setAutoResolve] = useState(false)
  const [query, setQuery] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => { setQuery(search.trim()); setPage(0) }, 250)
    return () => clearTimeout(timer)
  }, [search])
  const waitingForSearch = search.trim() !== query
  const editingItem = editor.action === 'CREATE' || editor.action === 'CORRECT'
  const { data, isLoading, error } = useEquipmentCatalog(category, query, page, editingItem && validLevel, filters)
  const { data: history = [] } = useEquipmentHistory(editor.memberId, admin)
  const [manualItem, setItem] = useState<EquipmentItem | null>(null)
  const [manualEffect, setEffect] = useState('')
  const [quantity, setQuantity] = useState(1)
  const validQuantity = !editor.delivery || (Number.isInteger(quantity) && quantity >= 1 && quantity <= 100)
  const [date, setDate] = useState(editor.original?.occurredOn ?? today())
  const [origin, setOrigin] = useState<EquipmentAssignment['origin']>(editor.original?.origin ?? (admin ? 'GUILD_DISTRIBUTION' : 'INITIAL'))
  const [equip, setEquip] = useState(!editor.delivery && (editor.action === 'CREATE' || !admin))
  const [replacement, setReplacement] = useState('')
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState<EquipmentOperation | null>(null)
  const [operationId, setOperationId] = useState(() => crypto.randomUUID())
  const completeCriteria = filters.level !== undefined && filters.grade !== undefined && (filters.grade !== 3 || !!filters.ability)
  const automaticItem = autoResolve && completeCriteria && !waitingForSearch && !isLoading && !error && data?.total === 1 ? data.items[0] : null
  const item = manualItem ?? automaticItem
  const effect = manualEffect || (item?.effects.length === 1 ? item.effects[0].key : '')
  const selectedEffect = item?.effects.find(e => e.key === effect)
  const effectsNeedReview = item?.effectsNote?.includes('conferência') ?? false
  const current = editor.position.assignment
  const [recipientId, setRecipientId] = useState('')
  const [recipientSlot, setRecipientSlot] = useState(editor.position.slot)
  const [replacementConsent, setReplacementConsent] = useState('')
  const recipient = members.find(m => m.memberId === Number(recipientId))
  const destination = recipient?.slots.find(s => s.slot === recipientSlot)
  const canTransfer = admin && editor.action === 'CREATE' && equip && !!current
  const transfer = canTransfer && !!recipientId
  const accessorySlots = SLOT_CATEGORY[editor.position.slot] === 'RING' ? ['Ring1', 'Ring2'] as const : SLOT_CATEGORY[editor.position.slot] === 'AMULET' ? ['Amulet1', 'Amulet2'] as const : []
  const consentKey = `${recipientId}:${recipientSlot}:${destination?.version}`
  const replaceRecipient = replacementConsent === consentKey
  const affectsCurrent = !!editor.original && current?.id === editor.original.id
  const saving = useRef(false)
  const directRequest = useRef<EquipmentOperation | null>(null)
  const transferIncomplete = transfer && (!recipient || !destination || (!!destination.assignment && !replaceRecipient))
  const selectItem = (value: EquipmentItem) => {
    setAutoResolve(false); setItem(value); setEffect(value.effects.length === 1 ? value.effects[0].key : '')
    if (editor.action === 'CREATE' && value.effects.length === 1) void saveDirect(value, value.effects[0].key)
    else setOperationId(crypto.randomUUID())
  }
  const changeFilters = (next: CatalogFilters) => {
    if (next.equipmentClass !== filters.equipmentClass || next.race !== filters.race) next = { ...next, weaponType: undefined, ability: undefined }
    setFilters(next); setPage(0); setItem(null); setEffect(''); setAutoResolve(true); setOperationId(crypto.randomUUID())
  }
  const operation = (selectedItem = item, selectedKey = effect): EquipmentOperation => ({
    operationId, action: editor.action, memberId: editor.memberId, slot: editor.position.slot,
    expectedVersion: editor.position.version, assignmentId: editor.original?.id, catalogId: selectedItem?.id,
    effectKey: selectedKey, ...(editor.delivery ? { quantity } : {}), origin: editor.delivery ? 'GUILD_DISTRIBUTION' : origin, occurredOn: date, useAsCurrent: editor.delivery ? false : editingItem ? equip : false,
    replacementId: !equip && replacement && replacement !== 'empty' ? Number(replacement) : undefined,
    restoration: affectsCurrent && !equip ? replacement === 'empty' ? 'EMPTY' : 'PREVIOUS' : undefined, reason: reason.trim(),
    transfer: transfer && recipient && destination ? { memberId: recipient.memberId,
      slot: accessorySlots.length ? recipientSlot : undefined, expectedVersion: destination.version, replaceCurrent: replaceRecipient } : undefined,
  })
  const saveDirect = async (selectedItem: EquipmentItem | null, selectedKey: string, send = false) => {
    if (saving.current || transferIncomplete || !validQuantity || (editor.delivery && (!date || date > today()))) return
    const next = operation(selectedItem, selectedKey)
    if (send) {
      if (!transfer) return
      next.action = 'TRANSFER'; next.useAsCurrent = false; next.catalogId = undefined; next.effectKey = undefined
    }
    const previous = directRequest.current
    if (previous && JSON.stringify({ ...previous, operationId: '' }) === JSON.stringify({ ...next, operationId: '' })) next.operationId = previous.operationId
    else next.operationId = crypto.randomUUID()
    directRequest.current = next
    saving.current = true
    try { await mutation.mutateAsync(next); showToast(send ? 'Equipamento enviado.' : editor.delivery ? `Entrega registrada: ${quantity} ${quantity === 1 ? 'item' : 'itens'}.` : 'Equipamento adicionado ao slot.', 'success'); onSaved() }
    catch { /* O formulário permanece aberto para corrigir ou repetir a mesma operação. */ }
    finally { saving.current = false }
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (editor.delivery) return
    if (editingItem && (!item || !effect)) return
    if (transferIncomplete) return
    if (editor.action === 'CREATE' && item) void saveDirect(item, effect)
    else setPending(operation())
  }
  const confirm = async () => {
    if (!pending) return
    try { await mutation.mutateAsync(pending); showToast('Equipamento salvo.', 'success'); onSaved() }
    catch { setPending(null) }
  }
  return <div className="equipment-editor"><h3>{editor.delivery ? 'Registrar entrega' : ACTION_LABELS[editor.action]} · {SLOT_LABELS[editor.position.slot]}</h3>
    <form ref={formRef} aria-label={editor.delivery ? 'Registrar entrega de item' : undefined} onSubmit={submit} onChange={() => setOperationId(crypto.randomUUID())}>
      {editor.delivery && <div className="equipment-form-row"><label>Quantidade<input type="number" required min={1} max={100} step={1} value={Number.isFinite(quantity) ? quantity : ''} onChange={e => setQuantity(e.target.valueAsNumber)} /></label><label>Data<input type="date" required max={today()} value={date} onChange={e => setDate(e.target.value)} /></label></div>}
      {editor.original && <p>Registro #{editor.original.id}: {itemLabel(editor.original)} · {effectLabel(editor.original.effect)}</p>}
      {editingItem && <>
        {canTransfer && <section className="equipment-transfer" aria-label="Repassar equipamento">
          <h4>Repassar equipamento</h4>
          <div className="equipment-transfer__item">
            <div className="equipment-transfer__icon"><EquipmentIcon item={current} size={48} /></div>
            <div className="equipment-transfer__description"><strong>{current.name}</strong>
              <div className="equipment-transfer__meta"><span>Lv. {current.level}</span><span className="equipment-transfer__grade">{gradeLabel(current.grade)}</span><span>{effectLabel(current.effect)}</span></div>
            </div>
          </div>
          <div className="equipment-transfer__send">
            <label>Destinatário<select value={recipientId} onChange={e => { setRecipientId(e.target.value); setReplacementConsent('') }}>
              <option value="">Manter somente no histórico</option>
              {members.filter(m => m.memberId !== editor.memberId).map(m => <option key={m.memberId} value={m.memberId}>{m.nickname}</option>)}
            </select></label>
            <Button type="button" aria-label="Enviar item" disabled={!transfer || mutation.isPending || transferIncomplete} onClick={() => void saveDirect(null, '', true)}>Enviar</Button>
          </div>
          {transfer && accessorySlots.length > 0 && <label className="equipment-transfer__extra">Posição do acessório<select value={recipientSlot} onChange={e => { setRecipientSlot(e.target.value as EquipmentSlot); setReplacementConsent('') }}>
            {accessorySlots.map(slot => <option key={slot} value={slot}>{slotDescription(slot)}</option>)}
          </select></label>}
          {transfer && destination?.assignment && <div className="equipment-transfer__extra">
            <p>{recipient?.nickname} · {slotDescription(recipientSlot)}: {itemLabel(destination.assignment)}</p>
            <label className="equipment-check"><input type="checkbox" checked={replaceRecipient} onChange={e => setReplacementConsent(e.target.checked ? consentKey : '')} />Substituir equipamento do destinatário e preservar no histórico</label>
          </div>}
        </section>}
        <div className="equipment-catalog-search">
        <label>Raça do equipamento<select disabled={cloak} value={filters.race ?? 'CORA'} onChange={e => changeFilters({ ...filters, race: e.target.value as CatalogFilters['race'] })}>
          <option value="CORA">Cora</option><option value="BELLATO">Bellato</option><option value="ACCRETIA">Accretia</option><option value="ALL">Todas as raças</option>
        </select></label>
        <label>Pesquisar item por nome ou código<input value={search} onChange={e => { setSearch(e.target.value); setItem(null); setEffect(''); setAutoResolve(true) }} placeholder="Nome ou código do item" maxLength={200} /></label>
        </div>
        {!restricted && <div className="equipment-class-grade">
        <fieldset className="equipment-filters"><legend>Classe do equipamento</legend><div>
          {([['MELEE', 'Melee'], ['RANGER', 'Ranger'], ['FORCE', 'Force']] as const).map(([equipmentClass, label]) => <Button key={equipmentClass} type="button" size="sm" variant="secondary" aria-pressed={filters.equipmentClass === equipmentClass} onClick={() => changeFilters({ ...filters, equipmentClass: filters.equipmentClass === equipmentClass ? undefined : equipmentClass })}>{label}</Button>)}
          {weapon && <Button type="button" size="sm" variant="secondary" aria-pressed={filters.equipmentClass === 'LAUNCHER'} onClick={() => changeFilters({ ...filters, equipmentClass: filters.equipmentClass === 'LAUNCHER' ? undefined : 'LAUNCHER' })}>Launcher</Button>}
          <Button type="button" size="sm" variant="secondary" aria-pressed={!filters.equipmentClass} onClick={() => changeFilters({ ...filters, equipmentClass: undefined })}>Todas as classes</Button>
        </div></fieldset>
        <fieldset className="equipment-filters"><legend>Grade do item</legend><div>
          <Button type="button" size="sm" variant="secondary" aria-pressed={filters.grade === undefined} onClick={() => changeFilters({ ...filters, grade: undefined, ability: undefined })}>ALL</Button>
          <Button type="button" size="sm" variant="secondary" aria-pressed={filters.grade === 1} onClick={() => changeFilters({ ...filters, level: weapon ? filters.level : undefined, grade: filters.grade === 1 ? undefined : 1, ability: undefined })}>B</Button>
          <Button type="button" size="sm" variant="secondary" aria-pressed={filters.grade === 3} onClick={() => changeFilters({ ...filters, level: weapon ? filters.level : undefined, grade: filters.grade === 3 ? undefined : 3, ability: undefined })}>C</Button>
        </div></fieldset>
        </div>}
        {accessory && <fieldset className="equipment-filters"><legend>Tipo de acessório</legend><div>
          <Button type="button" size="sm" variant="secondary" aria-pressed={!filters.accessoryEffect} onClick={() => changeFilters({ ...filters, accessoryEffect: undefined })}>Todos</Button>
          {([['ATTACK', 'Ataque'], ['DODGE', 'Esquiva'], ['DEFENSE', 'Defesa']] as const).map(([accessoryEffect, label]) => <Button key={accessoryEffect} type="button" size="sm" variant="secondary" aria-pressed={filters.accessoryEffect === accessoryEffect} onClick={() => changeFilters({ ...filters, accessoryEffect: filters.accessoryEffect === accessoryEffect ? undefined : accessoryEffect })}>{label}</Button>)}
        </div></fieldset>}
        {weapon && <fieldset className="equipment-filters"><legend>Tipo de arma</legend><div>
          <Button type="button" size="sm" variant="secondary" aria-pressed={filters.weaponType === undefined} onClick={() => changeFilters({ ...filters, weaponType: undefined })}>Todos</Button>
          {data?.weaponTypes?.map(weaponType => <Button key={weaponType} type="button" size="sm" variant="secondary" aria-pressed={filters.weaponType === weaponType} onClick={() => changeFilters({ ...filters, weaponType: filters.weaponType === weaponType ? undefined : weaponType })}>{WEAPON_TYPE_LABELS[weaponType] ?? `Tipo ${weaponType}`}</Button>)}
        </div></fieldset>}
        {weapon ? <fieldset className="equipment-filters"><legend>Nível do item</legend><WeaponLevelInput value={filters.level} onChange={level => changeFilters({ ...filters, level })} />{!validLevel && <p role="status">Informe um nível inteiro entre 35 e 50.</p>}</fieldset> : accessory ? null : cloak ? <fieldset className="equipment-filters"><legend>Nível do item</legend><div>{[undefined, 40, 50].map(level => <Button key={level ?? 'all'} type="button" size="sm" variant="secondary" aria-pressed={filters.level === level} onClick={() => changeFilters({ ...filters, level })}>{level ?? 'Todos'}</Button>)}</div></fieldset> : <fieldset className="equipment-filters"><legend>Nível do item</legend><div>
          <Button type="button" size="sm" variant="secondary" aria-pressed={filters.level === undefined} onClick={() => changeFilters({ ...filters, level: undefined })}>Todos 35–55</Button>
          {(filters.grade === 3 ? TYPE_C_LEVELS : [37, 39, 41, 43, 45, 47, 50].map(level => ({ base: level, required: level }))).map(level => <Button key={level.base} type="button" size="sm" variant="secondary" aria-pressed={filters.level === level.required} onClick={() => changeFilters({ ...filters, level: filters.level === level.required ? undefined : level.required })}>{filters.grade === 3 ? `${level.base} → ${level.required}` : level.required}</Button>)}
        </div></fieldset>}
        {filters.grade === 3 && <fieldset className="equipment-filters"><legend>Habilidade Type C</legend><div>
          <Button type="button" size="sm" variant="secondary" aria-pressed={!filters.ability} onClick={() => changeFilters({ ...filters, ability: undefined })}>Todas / outras</Button>
          {data?.abilities?.map(ability => <Button key={ability} type="button" size="sm" variant="secondary" aria-pressed={filters.ability === ability} onClick={() => changeFilters({ ...filters, ability: filters.ability === ability ? undefined : ability })}>{ability}</Button>)}
        </div></fieldset>}
        {completeCriteria && !isLoading && !waitingForSearch && data && data.total > 1 && <p role="status">{data.total} modelos correspondem aos critérios. Escolha o item ou refine pelo nome/código.</p>}
        {(isLoading || waitingForSearch) && <p role="status">Buscando catálogo…</p>}{error && <p role="alert">{error.message}</p>}
        {!isLoading && !waitingForSearch && !error && <div className="equipment-results" role="group" aria-label="Resultados de itens">
          {data?.items.map(candidate => <button key={candidate.id} type="button" className="equipment-result" aria-pressed={item?.id === candidate.id} aria-label={`Selecionar ${candidate.name} · ${candidate.gameCode}`} disabled={mutation.isPending || transferIncomplete || !validQuantity || (!!editor.delivery && (!date || date > today()))} onClick={() => selectItem(candidate)}>
            <EquipmentIcon item={candidate} size={40} /><span><strong>{candidate.name}</strong><small>Lv. {candidate.level} · {gradeLabel(candidate.grade)} · {candidate.gameCode} · {candidate.effects.length ? candidate.effects.map(effectLabel).join(' / ') : 'Sem efeito extra'}</small></span><span aria-hidden="true">{item?.id === candidate.id ? '●' : '○'}</span>
          </button>)}
          {data?.items.length === 0 && <p>Nenhum item encontrado nesta categoria com os filtros selecionados. Ajuste os botões ou tente parte do nome/código.</p>}
        </div>}
        {item && <div className="equipment-item-preview"><EquipmentIcon item={item} size={48} /><p><strong>Selecionado: {itemLabel(item)}</strong><small>{item.gameCode}</small></p><Button type="button" size="sm" variant="secondary" onClick={() => { setAutoResolve(false); setItem(null); setEffect(''); setOperationId(crypto.randomUUID()) }}>Limpar seleção</Button></div>}
        <div className="equipment-pagination"><Button type="button" size="sm" variant="secondary" disabled={page === 0 || waitingForSearch || isLoading} onClick={() => setPage(page - 1)}>Anterior</Button><span>{data?.total ?? 0} itens · página {page + 1}</span><Button type="button" size="sm" variant="secondary" disabled={!data || waitingForSearch || isLoading || (page + 1) * data.size >= data.total} onClick={() => setPage(page + 1)}>Próxima</Button></div>
        <label>{effectsNeedReview ? 'Efeito original — conferir separação do padrão' : 'Efeito extra do item'}<select required value={effect} disabled={!item} onChange={e => { setEffect(e.target.value); if (editor.action === 'CREATE' && item && e.target.value) void saveDirect(item, e.target.value) }}><option value="">Selecione o efeito</option>{item?.effects.map(e => <option key={e.key} value={e.key}>{effectLabel(e)}</option>)}</select></label>
        <small>Definições do dicionário de equipamentos do rf-loot-editor; bônus padrão de classe removidos quando confirmados na fonte.</small>
        {item?.effectsNote && <p className="equipment-note" role={effectsNeedReview ? 'alert' : undefined}>{item.effectsNote}</p>}
        {admin && !editor.delivery && <><div className="equipment-form-row"><label>Data<input type="date" required max={today()} value={date} onChange={e => setDate(e.target.value)} /></label><label>Origem<select value={origin} onChange={e => setOrigin(e.target.value as EquipmentAssignment['origin'])}><option value="GUILD_DISTRIBUTION">Entrega da guild</option><option value="INITIAL">Equipamento inicial</option>{editor.original?.origin === 'GAME_CLIENT' && editor.action === 'CORRECT' && <option value="GAME_CLIENT">Enviado pelo jogo</option>}</select></label></div>
        {editor.action !== 'CREATE' && <label className="equipment-check"><input type="checkbox" checked={equip} onChange={e => { setEquip(e.target.checked); setReplacement('') }} />Usar como equipamento atual</label>}
        {editor.action !== 'CREATE' && !canTransfer && <p className="equipment-note">{equip ? 'Somente esta posição será atualizada após a confirmação.' : affectsCurrent ? 'A correção retira o registro atual. Escolha abaixo o estado que deve ficar.' : 'Somente o histórico será registrado; o equipamento atual será preservado.'}</p>}</>}

      </>}
      {affectsCurrent && !equip && <label>Após {editor.action === 'CANCEL' ? 'cancelar' : 'corrigir'}, esta posição deve ficar<select required value={replacement} onChange={e => setReplacement(e.target.value)}><option value="">Escolha explicitamente</option><option value="empty">Vazia / não informada</option>{history.filter(r => r.slot === editor.position.slot && r.status === 'ACTIVE' && r.id !== editor.original?.id).map(r => <option key={r.id} value={r.id}>#{r.id} · {itemLabel(r)} · {effectLabel(r.effect)}</option>)}</select></label>}
      {(editor.action === 'CORRECT' || editor.action === 'CANCEL') && <label>Motivo<textarea required maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label>}
      {admin && <p className="equipment-note">Responsável: {user?.nickname}. Nenhum ponto ou leilão será alterado.</p>}
      {mutation.error && <p role="alert">{mutation.error.message} Se houver conflito, feche este formulário e abra a posição atualizada.</p>}
      <div className="equipment-actions"><Button type="button" variant="secondary" onClick={onClose} disabled={mutation.isPending}>Fechar</Button>{!editor.delivery && <Button type="submit" disabled={mutation.isPending || !validQuantity || (editingItem && (!item || !effect)) || (transfer && (!destination || (!!destination.assignment && !replaceRecipient)))}>{editor.action === 'CREATE' ? 'Adicionar ao slot' : 'Revisar e confirmar'}</Button>}</div>
    </form>
    <ConfirmDialog open={!!pending} title={ACTION_LABELS[editor.action]} confirmLabel="Confirmar registro" variant={editor.action === 'CANCEL' ? 'danger' : 'primary'} loading={mutation.isPending} onCancel={() => setPending(null)} onConfirm={confirm}>
      <p><strong>{editor.nickname} · {slotDescription(editor.position.slot)}</strong></p><p>{item ? itemLabel(item) : editor.original ? itemLabel(editor.original) : ''}</p>
      <p>Efeito: {selectedEffect ? effectLabel(selectedEffect) : editor.original ? effectLabel(editor.original.effect) : '—'}</p>
      {editingItem && <p>{originLabel(origin)} · {date.split('-').reverse().join('/')}</p>}
      {reason.trim() && <p>Motivo: {reason.trim()}</p>}
      {pending?.action === 'EQUIP' || pending?.useAsCurrent ? <p>Atual: {current ? itemLabel(current) : 'Não informado'} → {item ? itemLabel(item) : editor.original ? itemLabel(editor.original) : ''}. A substituição será registrada no histórico.</p> : affectsCurrent ? <p>O registro atual sairá desta posição. Destino escolhido: {replacement === 'empty' ? 'posição vazia' : `registro #${replacement}`}.</p> : <p>O equipamento atual será preservado.</p>}
      {pending?.transfer && current && <><p><strong>Repasse para {recipient?.nickname} · {slotDescription(recipientSlot)}</strong></p>
        <p>{itemLabel(current)} · {effectLabel(current.effect)}</p>
        <p>{destination?.assignment ? `Substituirá ${itemLabel(destination.assignment)}, preservado no histórico.` : 'A posição do destinatário está vazia.'}</p>
        <p>A substituição e o repasse serão salvos juntos.</p></>}
      <p>O responsável e o horário desta operação serão auditados.</p>
    </ConfirmDialog>
  </div>
}
