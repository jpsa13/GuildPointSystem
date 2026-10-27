import { useEffect, useState, type ReactNode } from 'react'
import type { QuestHistory } from '@/Domain/Quest/types'
import { useQuestVisibility } from '@/Domain/Quest/hooks/useQuests'
import { useAuthContext } from '@/Features/Auth/contexts/AuthContext'
import { Panel } from '@/Shared/ui/components/Panel/Panel'
import { Button } from '@/Shared/ui/components/Button/Button'

export function QuestPlayerPanel({ data }: { data: QuestHistory | undefined }) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(timer) }, [])
  const player = data?.player
  const sample = player?.sample
  const freshnessMs = player?.sessionId ? 15_000 : 90_000
  const fresh = !!player && !player.revoked && sample?.status === 'OBSERVED'
    && now - Date.parse(player.receivedAt) < freshnessMs && now - Date.parse(sample.sampledAt) < freshnessMs
  return <Panel className="quests__character" aria-label="Personagem identificado">
    <div className="quests__identity">
      <span className="quests__avatar" aria-hidden="true">{sample?.name.charAt(0).toUpperCase() || '—'}</span>
      <div><span className="quests__eyebrow">Personagem</span><h2>{sample?.name || 'Conecte seu personagem'}</h2>
        <span className={`quests__connection${fresh ? ' is-live' : ''}`} role="status">{fresh ? 'Monitor conectado' : sample ? 'Sem leitura recente' : 'Monitor desconectado'}</span>
      </div>
    </div>
    {sample && <div className="quests__stats"><div className="quests__level"><span>Nível</span><strong>{sample.level}</strong></div>
      <div className="quests__xp"><div><span>XP</span><strong>{sample.xpPercent == null ? 'Indisponível' : sample.xpPercent.toFixed(2) + '%'}</strong></div>
        {sample.xpPercent != null && <progress aria-label="Progresso de XP" max={100} value={sample.xpPercent} />}
      </div></div>}
    <details className="quests__character-info"><summary>Conexão</summary>
      {sample && <p>Última leitura: {new Date(sample.sampledAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (Brasília).</p>}
      <p>Identidade observada no cliente, vinculada ao cadastro no pareamento.</p>
      <a href="#quest-monitor-pairing">Gerenciar monitor</a>
    </details>
  </Panel>
}

const difficulties = ['Easy', 'Easy+', 'Medium', 'Medium+', 'Hard', 'Hard+', 'Outras']
const extraRewards: Record<string, string> = { Q070944: '1 caixa com 10 chocolates', Q070947: '1 caixa com 2 poções do caos' }
const extraCodes = new Set(Object.keys(extraRewards))
function difficulty(title: string) {
  const match = title.match(/\b(Easy|Medium|Hard)\+?(?=\s|$)/i)?.[0].toLowerCase()
  return difficulties.find(value => value.toLowerCase() === match) ?? 'Outras'
}
function shortName(title: string, code: string, index: number) {
  if (code === 'Q070944') return 'Chocolate Reward'
  if (code === 'Q070947') return 'Chaos Potion Reward'
  if (/Cartella Quest Reward/i.test(title)) return `Quest ${index + 1}`
  return title.replace(/^(\[[^\]]+\]\s*)+/, '')
}

export function QuestDailyList({ data, toolbar }: { data: QuestHistory | undefined; toolbar?: ReactNode }) {
  const { hasRole } = useAuthContext()
  const admin = hasRole('ADMINISTRADOR')
  const visibility = useQuestVisibility()
  const [npc, setNpc] = useState('')
  const [search, setSearch] = useState('')
  const [showHidden, setShowHidden] = useState(false)
  const [managing, setManaging] = useState(false)
  const rows = (data?.expected ?? []).filter(row => (showHidden || !row.hidden) && (!npc || row.definition.npcName === npc)
    && (row.definition.quest.code + ' ' + row.definition.quest.title).toLowerCase().includes(search.toLowerCase()))
  const completed = rows.filter(row => row.completionSignals > 0).length
  const extras = rows.filter(row => extraCodes.has(row.definition.quest.code))
  const renderQuest = (row: (typeof rows)[number], index: number, group: string) => {
    const d = row.definition
    const done = row.completionSignals > 0
    return <li className={done ? 'is-complete' : ''} key={d.quest.definitionHash}>
      <details className="quests__quest-detail"><summary aria-label={`${d.quest.title} · ${d.quest.code} · ${done ? 'Concluída' : 'Sem confirmação'}`}>
        <span className="quests__reward-slot" title={group === 'Outras' ? 'Recompensa' : `Recompensa ${group}`} aria-hidden="true">
          {group !== 'Outras' ? <img src={`/icons/quests/${group.replace('+', '').toLowerCase()}.png`} width={28} height={28} alt="" /> : <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M4 9h16v11H4zM3 5h18v4H3zM12 5v15" /></svg>}
        </span>
        <span className="quests__quest-name"><strong>{shortName(d.quest.title, d.quest.code, index)}</strong>{extraRewards[d.quest.code] && <span className="quests__reward-text">{extraRewards[d.quest.code]}</span>}{row.hidden && <span>Ocultada</span>}</span>
        <input type="checkbox" checked={done} disabled aria-label={d.quest.title} />
      </summary>
      <div className="quests__quest-body"><span className="quests__code">{d.quest.code}</span><p>{d.npcName} · {d.npcCodes.join(', ')}</p>
        <ul>{d.objectives.map((objective, i) => <li key={i}>{objective}</li>)}</ul>
        <p>Cora · {done ? 'Conclusão observada no período' : 'Sem confirmação de conclusão'}</p>
        {admin && managing && <Button size="sm" variant="ghost" disabled={visibility.isPending} onClick={() => visibility.mutate({ hash: d.quest.definitionHash, hidden: !row.hidden })}>{row.hidden ? 'Restaurar na lista' : 'Ocultar da lista'}</Button>}
      </div></details>
    </li>
  }
  return <Panel className="quests__checklist" title="Checklist" code={`CORA · ${completed} / ${rows.length}`} actions={toolbar}>
    <progress className="quests__sr-only" aria-label="Progresso da checklist" max={Math.max(1, rows.length)} value={completed} />
    {visibility.error && <p role="alert">{visibility.error.message}</p>}
    {!rows.length && <p className="quests__empty">Nenhuma quest nesta seleção.</p>}
    <div className="quests__groups">{difficulties.map(group => {
      const entries = rows.filter(row => !extraCodes.has(row.definition.quest.code) && difficulty(row.definition.quest.title) === group)
      if (!entries.length) return null
      return <section className={`quests__group${group === 'Outras' ? ' quests__group--other' : ''}`} key={group} aria-label={group}>
        <header><h3>{group}</h3><span>{entries.filter(row => row.completionSignals > 0).length}/{entries.length}</span></header>
        <ul>{entries.map((row, index) => renderQuest(row, index, group))}</ul>
      </section>
    })}</div>
    {extras.length > 0 && <section className="quests__extras" aria-label="Extras"><h3>Extras</h3><ul>{extras.map((row, index) => renderQuest(row, index, 'Outras'))}</ul></section>}
    <footer className="quests__list-footer"><span>Reset 03h · Brasília</span>
      <details onToggle={e => setManaging(e.currentTarget.open)}><summary>{admin ? 'Gerenciar lista' : 'Filtrar lista'}</summary>
        <div className="quests__filters"><label>NPC <select value={npc} onChange={e => setNpc(e.target.value)}><option value="">Todos</option>{(data?.npcCoverage ?? []).map(n => <option key={n.name}>{n.name}</option>)}</select></label>
          <label>Buscar quest <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nome ou código" /></label>
          {admin && <label className="quests__check"><input type="checkbox" checked={showHidden} onChange={e => setShowHidden(e.target.checked)} />Mostrar ocultadas</label>}
        </div>
        {(data?.npcCoverage ?? []).filter(n => n.questCount === 0).map(n => <p key={n.name}>{n.name}: nenhum vínculo de quest encontrado neste catálogo.</p>)}
        <p>Marcações do monitor local. Sem confirmação não significa que a quest não foi feita.</p>
      </details>
    </footer>
  </Panel>
}
