import { useState } from 'react'
import { useAuthContext } from '@/Features/Auth/contexts/AuthContext'
import { guilds, useRotation, useSaveRotation, type Assignment, type Guild, type Rotation, type RotationSlot } from '@/Domain/Rotation/hooks/useRotation'
import { Panel } from '@/Shared/ui/components/Panel/Panel'
import { Button } from '@/Shared/ui/components/Button/Button'
import { rotationTime, rotationTotals } from './Rotation.utils'
import './Rotation.styles.scss'

const zones = [{ label: 'Brasília', offset: 0 }, { label: 'Moscou', offset: 6 }, { label: 'Jacarta', offset: 10 }]
function Assignments({ entries, filter }: { entries: Assignment[]; filter: string }) {
  const shown = entries.filter(a => !filter || a.guild === filter)
  return <div className="rotation__assignments">{shown.length ? shown.map(a => <div key={a.guild} className={`rotation__assignment rotation--${a.guild}`}>
    <strong>{a.guild} <span>×{a.bosses.length}</span></strong>
    <p>{a.bosses.join(' / ')}</p>
  </div>) : <span className="rotation__empty">—</span>}</div>
}

function RotationEditor({ initial, close }: { initial: Rotation; close: () => void }) {
  const [draft, setDraft] = useState(() => structuredClone(initial))
  const save = useSaveRotation()
  const changeSlot = (index: number, change: Partial<RotationSlot>) => setDraft(d => ({ ...d, slots: d.slots.map((s, i) => i === index ? { ...s, ...change } : s) }))
  const changeAssignment = (index: number, area: 'qg' | 'outpost', entry: number, change: Partial<Assignment>) => {
    changeSlot(index, { [area]: draft.slots[index][area].map((a, i) => i === entry ? { ...a, ...change } : a) })
  }
  return <form className="rotation__editor" onSubmit={e => {
    e.preventDefault()
    const cleaned = { ...draft, slots: draft.slots.map(s => ({ ...s,
      qg: s.qg.map(a => ({ ...a, bosses: a.bosses.map(b => b.trim()).filter(Boolean) })),
      outpost: s.outpost.map(a => ({ ...a, bosses: a.bosses.map(b => b.trim()).filter(Boolean) })),
    })) }
    save.mutate(cleaned, { onSuccess: close })
  }}>
    <p>Horários de Brasília. Um boss por linha. Salvar publica para todos os membros.</p>
    <fieldset disabled={save.isPending}>
      {draft.slots.map((slot, index) => <Panel key={index} title={`Horário ${index + 1}`}>
        <div className="rotation__edit-time"><label>Horário <input aria-label={`Horário ${index + 1}`} type="time" required value={slot.time} onChange={e => changeSlot(index, { time: e.target.value })} /></label>
          <Button type="button" variant="ghost" disabled={draft.slots.length === 1} onClick={() => setDraft(d => ({ ...d, slots: d.slots.filter((_, i) => i !== index) }))}>Remover horário</Button></div>
        <div className="rotation__edit-areas">{(['qg', 'outpost'] as const).map(area => <section key={area} aria-label={`${slot.time} ${area}`}>
          <h3>{area === 'qg' ? 'QGs' : 'Outposts'}</h3>
          {slot[area].map((assignment, entry) => <div className="rotation__edit-assignment" key={entry}>
            <label>Guilda<select value={assignment.guild} onChange={e => changeAssignment(index, area, entry, { guild: e.target.value as Guild })}>{guilds.map(g => <option key={g}>{g}</option>)}</select></label>
            <label>Bosses<textarea required rows={Math.max(2, assignment.bosses.length)} maxLength={2000} value={assignment.bosses.join('\n')} onChange={e => changeAssignment(index, area, entry, { bosses: e.target.value.split('\n') })} /></label>
            <Button type="button" variant="ghost" onClick={() => changeSlot(index, { [area]: slot[area].filter((_, i) => i !== entry) })}>Remover grupo</Button>
          </div>)}
          <Button type="button" variant="secondary" disabled={slot[area].length >= guilds.length} onClick={() => changeSlot(index, { [area]: [...slot[area], { guild: guilds.find(g => !slot[area].some(a => a.guild === g)) ?? 'Energy', bosses: [''] }] })}>Adicionar guilda</Button>
        </section>)}</div>
      </Panel>)}
      <Button type="button" variant="secondary" disabled={draft.slots.length >= 24} onClick={() => setDraft(d => ({ ...d, slots: [...d.slots, { time: '00:00', qg: [], outpost: [] }] }))}>Adicionar horário</Button>
      <div className="rotation__editor-actions"><Button type="button" variant="ghost" onClick={close}>Cancelar</Button><Button type="submit" loading={save.isPending}>Salvar rotação</Button></div>
    </fieldset>
    {save.error && <p role="alert">{save.error.message}</p>}
  </form>
}

export function RotationPage() {
  const { hasRole } = useAuthContext()
  const { data, isPending, error, refetch } = useRotation()
  const [tab, setTab] = useState<'bosses' | 'exp'>('bosses')
  const [filter, setFilter] = useState('')
  const [editing, setEditing] = useState(false)
  return <div className="rotation">
    <div className="rotation__heading"><h1>Rotação</h1><div className="rotation__tabs" aria-label="Tipo de rotação">
      <Button variant={tab === 'bosses' ? 'primary' : 'ghost'} aria-pressed={tab === 'bosses'} disabled={editing} onClick={() => setTab('bosses')}>Bosses</Button>
      <Button variant={tab === 'exp' ? 'primary' : 'ghost'} aria-pressed={tab === 'exp'} disabled={editing} onClick={() => setTab('exp')}>EXP</Button>
    </div></div>
    {tab === 'exp' ? <Panel title="Rotação de EXP"><p>A rotação de EXP ainda não foi publicada.</p></Panel> : <>
      {isPending && <p role="status">Carregando rotação…</p>}
      {error && <p role="alert">Não foi possível carregar a rotação. <Button onClick={() => void refetch()}>Tentar novamente</Button></p>}
      {data && (editing ? <RotationEditor initial={data} close={() => setEditing(false)} /> : <>
        <div className="rotation__toolbar"><div><h2>Agenda diária de bosses</h2><p>QG / Outpost / Total · horários se repetem diariamente</p></div>
          <label>Guilda<select aria-label="Filtrar guilda" value={filter} onChange={e => setFilter(e.target.value)}><option value="">Todas</option>{guilds.map(g => <option key={g}>{g}</option>)}</select></label>
          {hasRole('ADMINISTRADOR') && <Button variant="secondary" onClick={() => setEditing(true)}>Editar rotação</Button>}
        </div>
        <div className="rotation__totals">{guilds.filter(g => !filter || g === filter).map(g => {
          const n = rotationTotals(data.slots, g)
          return <div className={`rotation__total rotation--${g}`} key={g}><strong>{g}</strong><span aria-label={`${g}: ${n.qg} QG, ${n.outpost} Outpost, ${n.qg + n.outpost} total`}>{n.qg} / {n.outpost} / <b>{n.qg + n.outpost}</b></span></div>
        })}</div>
        <Panel title="Divisão diária" flush><div className="rotation__table-wrap"><table className="rotation__table">
          <thead><tr>{zones.map(z => <th scope="col" key={z.label}>{z.label}</th>)}<th scope="col">Divisão dos QGs</th><th scope="col">Divisão dos Outposts</th></tr></thead>
          <tbody>{data.slots.filter(s => !filter || [...s.qg, ...s.outpost].some(a => a.guild === filter)).map(slot => <tr key={slot.time}>
            {zones.map((z, i) => i === 0 ? <th scope="row" key={z.label}>{rotationTime(slot.time, z.offset)}</th> : <td className="rotation__time" key={z.label}>{rotationTime(slot.time, z.offset)}</td>)}
            <td><Assignments entries={slot.qg} filter={filter} /></td><td><Assignments entries={slot.outpost} filter={filter} /></td>
          </tr>)}</tbody>
        </table></div></Panel>
        <p className="rotation__footnote">+1 = dia seguinte em relação a Brasília. Atualizada em {new Date(data.updatedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (Brasília).</p>
      </>)}
    </>}
  </div>
}
