import { Link } from 'react-router-dom'
import {
  useApproveMember,
  usePendingMembers,
  useSuspendedMembers,
  useUnsuspendMember,
} from '@/Domain/Member/hooks/useMembers'
import { useAuthContext } from '@/Features/Auth/contexts/AuthContext'
import { useAppToast } from '@/Shared/ui/components/AppToast/AppToast'
import { Button } from '@/Shared/ui/components/Button/Button'
import { Panel } from '@/Shared/ui/components/Panel/Panel'
import { formatLastLogin } from '@/Shared/utils/memberLastLogin'
import './Approvals.styles.scss'

export function ApprovalsPage() {
  const { data: pending = [], isLoading } = usePendingMembers()
  const approveMember = useApproveMember()
  const { hasRole } = useAuthContext()

  if (isLoading) return <p>Carregando pendentes...</p>

  return (
    <div className="approvals-page__stack">
      <Panel
        title="Aprovações pendentes"
        variant="danger"
        code={`${pending.length} PND`}
        className="approvals-page"
        flush
      >
        {pending.length === 0 ? (
          <p className="approvals-page__empty">Nenhum cadastro pendente.</p>
        ) : (
          <ul className="approvals-list">
            {pending.map((member) => (
              <li key={member.id} className="approvals-list__item">
                <span className="approvals-list__slot" aria-hidden="true">
                  {member.nickname.slice(0, 1).toUpperCase()}
                </span>
                <div className="approvals-list__info">
                  <strong>{member.nickname}</strong>
                  <small>
                    {member.email} · {member.raceName} / {member.className}
                  </small>
                </div>
                <div className="approvals-list__actions">
                  <Button
                    size="sm"
                    onClick={() => approveMember.mutate({ id: member.id, status: 'APROVADO' })}
                    loading={approveMember.isPending}
                  >
                    Aprovar
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => approveMember.mutate({ id: member.id, status: 'REJEITADO' })}
                    loading={approveMember.isPending}
                  >
                    Rejeitar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {hasRole('ADMINISTRADOR') && <SuspendedPanel />}
    </div>
  )
}

/** Administrador+: suspended accounts, with a shortcut to lift each suspension. */
function SuspendedPanel() {
  const { data: suspended = [], isLoading } = useSuspendedMembers()
  const unsuspend = useUnsuspendMember()
  const { showToast } = useAppToast()

  return (
    <Panel title="Contas suspensas" variant="amber" code={`${suspended.length} SUS`} flush>
      {isLoading ? (
        <p className="approvals-page__empty">Carregando...</p>
      ) : suspended.length === 0 ? (
        <p className="approvals-page__empty">Nenhuma conta suspensa.</p>
      ) : (
        <ul className="approvals-list">
          {suspended.map((member) => (
            <li key={member.id} className="approvals-list__item">
              <span className="approvals-list__slot" aria-hidden="true">
                {member.nickname.slice(0, 1).toUpperCase()}
              </span>
              <div className="approvals-list__info">
                <Link to={`/profile/${member.id}`} className="approvals-list__name">
                  <strong>{member.nickname}</strong>
                </Link>
                <small>
                  Suspensa em {formatLastLogin(member.suspendedAt)}
                  {member.suspensionReason ? ` · ${member.suspensionReason}` : ''}
                </small>
              </div>
              <div className="approvals-list__actions">
                <Button
                  size="sm"
                  loading={unsuspend.isPending && unsuspend.variables === member.id}
                  onClick={() =>
                    unsuspend.mutate(member.id, {
                      onSuccess: () =>
                        showToast(`Suspensão de ${member.nickname} retirada.`, 'success'),
                      onError: (err) =>
                        showToast(
                          err instanceof Error
                            ? err.message
                            : 'Não foi possível retirar a suspensão.',
                          'error',
                        ),
                    })
                  }
                >
                  Retirar suspensão
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
