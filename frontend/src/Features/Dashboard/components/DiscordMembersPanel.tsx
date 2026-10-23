import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  useDiscordMembers,
  useHiddenDiscordMembers,
  useSetDiscordMemberHidden,
  type DiscordMember,
} from '@/Domain/Discord/hooks/useDiscordMembers'
import { useLinkDiscord, useMemberRanking } from '@/Domain/Member/hooks/useMembers'
import { useAuthContext } from '@/Features/Auth/contexts/AuthContext'
import { useAppToast } from '@/Shared/ui/components/AppToast/AppToast'
import { ConfirmDialog } from '@/Shared/ui/components/ConfirmDialog/ConfirmDialog'
import { Panel } from '@/Shared/ui/components/Panel/Panel'
import { discordProfileUrl, openInDiscordApp } from '@/Shared/utils/discordLink'
import './DiscordMembersPanel.styles.scss'

const STATUS_LABEL: Record<DiscordMember['status'], string> = {
  online: 'Online',
  idle: 'Ausente',
  dnd: 'Não perturbe',
  offline: 'Offline',
}

interface MemberRowProps {
  member: DiscordMember
  /** Set for Líder/Administrador: opens the link-to-site-account dialog. */
  onLink?: (member: DiscordMember) => void
  /** Set for Líder/Administrador: hides the member from (or shows them again in) the list. */
  onToggleHidden?: (member: DiscordMember) => void
  hidden?: boolean
}

function MemberRow({ member, onLink, onToggleHidden, hidden = false }: MemberRowProps) {
  const subtitle = member.customStatus ?? (member.inVoice ? 'Em voz' : member.activity)
  return (
    <li className={`discord-list__member discord-list__member--${member.status}`}>
      <a
        href={discordProfileUrl(member.id)}
        target="_blank"
        rel="noopener noreferrer"
        className="discord-list__open"
        title={`Abrir perfil de ${member.name} no Discord`}
        onClick={(e) => openInDiscordApp(e, member.id)}
      >
        <span className="discord-list__avatar" title={STATUS_LABEL[member.status]}>
          <img src={member.avatarUrl} alt="" loading="lazy" />
          <span className={`discord-list__status discord-list__status--${member.status}`} />
        </span>
        <span className="discord-list__text">
          <span className="discord-list__name" style={member.color ? { color: member.color } : undefined}>
            {member.name}
          </span>
          {subtitle && (
            <span className={`discord-list__sub${member.inVoice && !member.customStatus ? ' discord-list__sub--voice' : ''}`}>
              {subtitle}
            </span>
          )}
        </span>
      </a>
      {member.siteMemberId && (
        <Link
          to={`/profile/${member.siteMemberId}`}
          className="discord-list__site"
          title="Ver perfil no site"
          aria-label={`Ver perfil de ${member.name} no site`}
        >
          ⧉
        </Link>
      )}
      {onLink && (
        <button
          type="button"
          className="discord-list__site"
          title={member.siteMemberId ? 'Alterar vínculo com conta do site' : 'Vincular a uma conta do site'}
          aria-label={`Vincular ${member.name} a uma conta do site`}
          onClick={() => onLink(member)}
        >
          🔗
        </button>
      )}
      {onToggleHidden && (
        <button
          type="button"
          className={`discord-list__site${hidden ? ' discord-list__site--visible' : ''}`}
          title={hidden ? 'Mostrar na lista' : 'Ocultar da lista'}
          aria-label={`${hidden ? 'Mostrar' : 'Ocultar'} ${member.name} na lista`}
          onClick={() => onToggleHidden(member)}
        >
          {hidden ? '👁' : '🚫'}
        </button>
      )}
    </li>
  )
}

interface DiscordMembersPanelProps {
  className?: string
}

export function DiscordMembersPanel({ className }: DiscordMembersPanelProps) {
  const { data, isLoading } = useDiscordMembers()
  const { hasRole } = useAuthContext()
  const canManage = hasRole('ADMINISTRADOR') // Líder ranks above Administrador
  const [linking, setLinking] = useState<DiscordMember | null>(null)
  const [showHidden, setShowHidden] = useState(false)
  const { data: hidden = [] } = useHiddenDiscordMembers(canManage && !!data?.available)
  const setHidden = useSetDiscordMemberHidden()
  const { showToast } = useAppToast()
  const groups = data?.groups ?? []
  const online = groups.reduce((sum, g) => sum + g.onlineCount, 0)

  const toggleHidden = (member: DiscordMember, hide: boolean) =>
    setHidden.mutate(
      { id: member.id, hidden: hide },
      {
        onSuccess: () => showToast(`${member.name} ${hide ? 'ocultado da' : 'voltou para a'} lista.`, 'success'),
        onError: (err) => showToast(err instanceof Error ? err.message : 'Erro ao atualizar a lista', 'error'),
      },
    )

  return (
    <Panel
      title="Discord"
      code={data?.available ? `${online} ON` : undefined}
      className={`discord-panel ${className ?? ''}`.trim()}
    >
      {isLoading ? (
        <p className="discord-panel__empty">Carregando…</p>
      ) : !data?.available ? (
        <p className="discord-panel__empty">Lista do Discord indisponível.</p>
      ) : (
        <div className="discord-list">
          {groups.map((group) => (
            <section key={group.id} className="discord-list__group">
              <h3 className="discord-list__role">
                {group.name} — {group.onlineCount}
                <span className="discord-list__role-total">/{group.members.length}</span>
              </h3>
              <ul>
                {group.members.map((m) => (
                  <MemberRow
                    key={m.id}
                    member={m}
                    onLink={canManage ? setLinking : undefined}
                    onToggleHidden={canManage ? (member) => toggleHidden(member, true) : undefined}
                  />
                ))}
              </ul>
            </section>
          ))}
          {canManage && hidden.length > 0 && (
            <section className="discord-list__group discord-list__group--hidden">
              <button
                type="button"
                className="discord-list__role discord-list__toggle"
                aria-expanded={showHidden}
                onClick={() => setShowHidden((v) => !v)}
              >
                {showHidden ? '▾' : '▸'} Ocultos — {hidden.length}
              </button>
              {showHidden && (
                <ul>
                  {hidden.map((m) => (
                    <MemberRow key={m.id} member={m} hidden onToggleHidden={(member) => toggleHidden(member, false)} />
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}
      {linking && (
        <LinkDiscordDialog
          member={linking}
          linkedIds={new Set(groups.flatMap((g) => g.members.map((m) => m.siteMemberId)))}
          onClose={() => setLinking(null)}
        />
      )}
    </Panel>
  )
}

interface LinkDiscordDialogProps {
  member: DiscordMember
  /** Site accounts already shown in the list as linked (to another Discord user). */
  linkedIds: Set<number | null>
  onClose: () => void
}

function LinkDiscordDialog({ member, linkedIds, onClose }: LinkDiscordDialogProps) {
  const { data: siteMembers = [] } = useMemberRanking()
  const linkDiscord = useLinkDiscord()
  const { showToast } = useAppToast()
  const [selected, setSelected] = useState<number | ''>(member.siteMemberId ?? '')

  const options = [...siteMembers]
    .filter((m) => m.id === member.siteMemberId || !linkedIds.has(m.id))
    .sort((a, b) => a.nickname.localeCompare(b.nickname))

  const run = async (id: number, discordId: string | null, message: string) => {
    try {
      await linkDiscord.mutateAsync({ id, discordId })
      showToast(message, 'success')
      onClose()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao vincular conta', 'error')
    }
  }

  const handleConfirm = () => {
    if (selected === '') {
      if (member.siteMemberId) {
        run(member.siteMemberId, null, `${member.name} desvinculado.`)
      } else {
        onClose()
      }
      return
    }
    const target = siteMembers.find((m) => m.id === selected)
    run(selected, member.id, `${member.name} vinculado a ${target?.nickname ?? 'conta do site'}.`)
  }

  return (
    <ConfirmDialog
      open
      title="Vincular Discord"
      code="ADM"
      variant="primary"
      confirmLabel="Salvar"
      loading={linkDiscord.isPending}
      onConfirm={handleConfirm}
      onCancel={onClose}
    >
      <div className="discord-link">
        <p>
          Conta do site de{' '}
          <strong style={member.color ? { color: member.color } : undefined}>{member.name}</strong>:
        </p>
        <select
          className="discord-link__select"
          value={selected}
          onChange={(e) => setSelected(e.target.value === '' ? '' : Number(e.target.value))}
        >
          <option value="">— Nenhuma —</option>
          {options.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nickname}
            </option>
          ))}
        </select>
      </div>
    </ConfirmDialog>
  )
}
