import { useState } from 'react'
import { useQuests, useQuestPairing, useQuestRevoke, useLiveQuestPairing } from '@/Domain/Quest/hooks/useQuests'
import { QuestDailyList, QuestPlayerPanel } from './QuestLivePanels'
import type { QuestObservation, QuestState } from '@/Domain/Quest/types'
import { Panel } from '@/Shared/ui/components/Panel/Panel'
import { Button } from '@/Shared/ui/components/Button/Button'
import './Quests.styles.scss'

const labels: Record<QuestState, string> = {
  PRESENT: 'Presença observada', COMPLETION_SIGNAL: 'Sinal de conclusão detectado', REMOVED_UNKNOWN: 'Removida · causa indeterminada',
  STATE_CHANGED: 'Mudança de estado observada',
}
function category(o: QuestObservation) {
  const e = o.event
  if (e.group === 1 && e.type === 1) return ['Q071356', 'Q071396'].includes(e.code) ? 'NPC · caso validado' : 'NPC candidata · mapeamento não validado'
  return e.group === 0 && e.type === 0 ? 'Comum candidata' : 'Origem indeterminada'
}
export function QuestsPage() {
  const [day, setDay] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() - 3 * 3600_000)))
  const [resetPeriod, setResetPeriod] = useState(true)
  const history = useQuests(day, resetPeriod)
  const pairing = useQuestPairing()
  const revoke = useQuestRevoke()
  const livePairing = useLiveQuestPairing()
  const [expectedName, setExpectedName] = useState('')
  const data = history.data?.pages[0]
  const events = history.data?.pages.flatMap(p => p.events) ?? []
  const ordered = [...events].sort((a, b) => Number(b.event.group === 1 && b.event.type === 1) - Number(a.event.group === 1 && a.event.type === 1)
    || a.event.occurredAt.localeCompare(b.event.occurredAt) || a.event.sequence - b.event.sequence)
  const runs = new Map<string, QuestObservation[]>()
  for (const observation of ordered) {
    const key = `${observation.sessionId}:${observation.event.runId}`
    const run = runs.get(key) ?? []
    run.push(observation)
    runs.set(key, run)
  }
  const format = (value: string) => new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const error = history.error ?? pairing.error ?? revoke.error ?? livePairing.error
  return <div className="quests">
    <QuestPlayerPanel data={data} />
    {error && <p role="alert">{error.message}</p>}
    {history.isLoading && <p role="status">Carregando checklist…</p>}
    <QuestDailyList data={data} toolbar={<div className="quests__date-controls"><label><span className="quests__sr-only">Data</span><input type="date" value={day} onChange={e => { if (e.target.value) setDay(e.target.value) }} /></label>
      <Button size="sm" variant="ghost" disabled={!day || history.isFetching} onClick={() => void history.refetch()}>Atualizar</Button></div>} />
    <details className="quests__advanced"><summary>Histórico e conexão</summary>
    <Panel title="Histórico das observações">
      {history.isLoading && <p role="status">Carregando observações…</p>}
      {!history.isLoading && !history.isError && events.length === 0 && <p>Nenhuma observação registrada neste dia.</p>}
      {events.length > 0 && <>
        <p>{events.filter(o => o.event.state === 'COMPLETION_SIGNAL').length} sinais de conclusão nesta consulta{history.hasNextPage ? ' (carregamento parcial)' : ''}. Origens identificadas por ocorrência; nenhuma confirmação do servidor RF.</p>
        <h3>Checklist das execuções observadas no período</h3>
        <ul className="quests__events">{[...runs].map(([key, observations]) => {
          const latest = observations[observations.length - 1]
          const completed = observations.some(o => o.event.state === 'COMPLETION_SIGNAL')
          return <li key={key}><label className="quests__check"><input type="checkbox" disabled checked={completed} />
            {latest.event.title || latest.event.code} · {latest.event.code} · {completed ? 'Sinal observado neste período' : 'Sem sinal de conclusão neste período'}
          </label><p>{category(latest)} · {latest.source === 'SIMULATION' ? 'SIMULAÇÃO' : 'MONITOR LOCAL'} · Última ocorrência: {format(latest.event.occurredAt)}.</p></li>
        })}</ul>
        <h3>Histórico das ocorrências</h3>
        <ol className="quests__events">{ordered.map(o => <li key={`${o.sessionId}:${o.event.eventId}`}>
          <div><strong>{o.event.title || o.event.code}</strong> <span className="quests__code">{o.event.code}</span></div>
          <div>{category(o)} · <strong>{labels[o.event.state]}</strong></div>
          <div><time dateTime={o.event.occurredAt}>{format(o.event.occurredAt)}</time> · {o.source === 'SIMULATION' ? 'SIMULAÇÃO' : 'MONITOR LOCAL · EXPERIMENTAL'} · {o.monitorVersion}</div>
          <details><summary>Origem e sincronização</summary>
            <p>Recebido: {format(o.receivedAt)}. Sessão: {o.sessionId}. Execução: {o.event.runId}.</p>
            <p>Identidade da definição: {o.event.definitionHash}. Cliente: {o.event.clientHash}. EDF: {o.event.edfHash}.</p>
            <p>Grupo {o.event.group}, tipo {o.event.type}, slot {o.event.slot}. Presença não garante estado atual após lacunas.</p>
          </details>
        </li>)}</ol>
        {history.hasNextPage && <Button disabled={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>Carregar mais observações</Button>}
      </>}
    </Panel>
    <Panel title="Monitor e sincronização" id="quest-monitor-pairing">
      <label>Período da consulta <select value={String(resetPeriod)} onChange={e => setResetPeriod(e.target.value === 'true')}>
        <option value="true">Dia da guilda · 03h até 03h</option><option value="false">Dia civil · 00h até 00h</option>
      </select></label>
      <p>Monitor real em validação local. O vínculo ao cadastro é confirmado ao parear; se o nome, conexão ou identidade observada mudar, será necessário parear novamente.</p>
      {data?.liveEnabled && <div className="quests__filters">
        <label>Personagem conectado <input value={expectedName} onChange={e => setExpectedName(e.target.value)} placeholder="Nome exato no jogo" maxLength={32} /></label>
        <Button disabled={!expectedName.trim() || livePairing.isPending} onClick={() => livePairing.mutate(expectedName.trim())}>Parear este personagem</Button>
      </div>}
      {livePairing.data && <div><p>Use este token somente no monitor local. Ele não dá acesso à conta do site.</p>
        <label>Token do monitor <input readOnly value={livePairing.data.token} onFocus={e => e.target.select()} /></label>
        <Button variant="secondary" onClick={() => livePairing.reset()}>Ocultar token do monitor</Button></div>}
      {data?.simulationEnabled && <Button disabled={pairing.isPending} onClick={() => { pairing.reset(); pairing.mutate() }}>Criar sessão de simulação (24h)</Button>}
      {pairing.data && <div role="status">
        <p>Token mostrado uma vez nesta tela. Use no replay local; revogue ao encerrar.</p>
        <label>Token da simulação <input readOnly value={pairing.data.token} onFocus={e => e.target.select()} /></label>
        <Button variant="secondary" onClick={() => pairing.reset()}>Ocultar token</Button>
      </div>}
      <ul>{data?.sessions.map(s => <li key={s.id}>
        <span className="quests__code">{s.id}</span> · {s.source} · {s.monitorVersion}
        <p>{s.revokedAt ? 'Revogada' : 'Expiração: ' + format(s.expiresAt)}.
          {' '}Último recebimento: {s.lastReceivedAt ? format(s.lastReceivedAt) : 'nenhum'}.</p>
        {!s.revokedAt && <Button variant="danger" disabled={revoke.isPending} onClick={() => revoke.mutate(s.id, { onSuccess: () => { pairing.reset(); livePairing.reset() } })}>Revogar sessão</Button>}
      </li>)}</ul>
    </Panel>
    </details>
  </div>
}
