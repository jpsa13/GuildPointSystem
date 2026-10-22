import { usePendingMembers } from '@/Domain/Member/hooks/useMembers'
import { NavBadge } from '@/Shared/ui/components/NavBadge/NavBadge'

/** Sidebar bubble with the number of registrations awaiting approval; hovering it lists them. */
export function ApprovalsNavBadge() {
  const { data: pending = [] } = usePendingMembers()

  return (
    <NavBadge count={pending.length} ariaLabel={`${pending.length} cadastro(s) pendente(s)`} title="Cadastros pendentes">
      {pending.map((m) => (
        <li key={m.id} className="nav-popover__row">
          <span className="nav-popover__name">{m.nickname}</span>
          <span className="nav-popover__time">{m.className ?? 'Perfil incompleto'}</span>
        </li>
      ))}
    </NavBadge>
  )
}
