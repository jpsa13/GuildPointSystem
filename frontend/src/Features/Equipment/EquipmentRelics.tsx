import { useEquipmentRelics, useEquipmentRelicChange } from '@/Domain/Equipment/hooks/useEquipment'
import groups from '@/Domain/Equipment/relics.json'
import './EquipmentRelics.styles.scss'

export function EquipmentRelics({ memberId, editable }: { memberId: number; editable: boolean }) {
  const { data: active = [], isLoading, error, refetch } = useEquipmentRelics(memberId)
  const change = useEquipmentRelicChange(memberId)
  return <section className="equipment-relics" aria-label="Relics">
    <h3>Relics</h3>
    {isLoading && <p role="status">Carregando Relics…</p>}
    {error && <p role="alert">{error.message} <button type="button" onClick={() => void refetch()}>Tentar novamente</button></p>}
    {change.error && <p role="alert">Não foi possível salvar a Relic. Tente novamente.</p>}
    <div className="equipment-relics__grades">{groups.map(group => <section key={group.grade} className="equipment-relics__grade" aria-label={`Grade ${group.grade}`}>
      <h4>Grade {group.grade}</h4>
      <div className="equipment-relics__list">{group.items.map((item, index) => <button key={item.id} type="button"
        className={`equipment-relics__icon${active.includes(item.id) ? ' is-active' : ''}`}
        style={{ backgroundPosition: item.position }} aria-label={`Relic ${index + 1} · Grade ${group.grade}`}
        aria-pressed={active.includes(item.id)} title={`Relic ${index + 1} · Grade ${group.grade} · ${active.includes(item.id) ? 'Ativada' : 'Desativada'}`}
        disabled={!editable || isLoading || !!error || change.isPending}
        onClick={() => change.mutate({ relicId: item.id, active: !active.includes(item.id) })} />)}</div>
    </section>)}</div>
  </section>
}
