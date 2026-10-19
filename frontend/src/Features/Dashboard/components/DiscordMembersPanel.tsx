import { Link } from 'react-router-dom'
import { useDiscordMembers, type DiscordMember } from '@/Domain/Discord/hooks/useDiscordMembers'
import { Panel } from '@/Shared/ui/components/Panel/Panel'
import './DiscordMembersPanel.styles.scss'

const STATUS_LABEL: Record<DiscordMember['status'], string> = {
  online: 'Online',
  idle: 'Ausente',
  dnd: 'Não perturbe',
  offline: 'Offline',
}

function MemberRow({ member }: { member: DiscordMember }) {
  const subtitle = member.customStatus ?? (member.inVoice ? 'Em voz' : member.activity)
  const name = (
    <span className="discord-list__name" style={member.color ? { color: member.color } : undefined}>
      {member.name}
    </span>
  )
  return (
    <li className={`discord-list__member discord-list__member--${member.status}`}>
      <span className="discord-list__avatar" title={STATUS_LABEL[member.status]}>
        <img src={member.avatarUrl} alt="" loading="lazy" />
        <span className={`discord-list__status discord-list__status--${member.status}`} />
      </span>
      <span className="discord-list__text">
        {member.siteMemberId ? (
          <Link to={`/profile/${member.siteMemberId}`} className="discord-list__link">
            {name}
          </Link>
        ) : (
          name
        )}
        {subtitle && (
          <span className={`discord-list__sub${member.inVoice && !member.customStatus ? ' discord-list__sub--voice' : ''}`}>
            {subtitle}
          </span>
        )}
      </span>
    </li>
  )
}

interface DiscordMembersPanelProps {
  className?: string
}

export function DiscordMembersPanel({ className }: DiscordMembersPanelProps) {
  const { data, isLoading } = useDiscordMembers()
  const groups = data?.groups ?? []
  const online = groups.reduce((sum, g) => sum + g.onlineCount, 0)

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
                  <MemberRow key={m.id} member={m} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Panel>
  )
}
