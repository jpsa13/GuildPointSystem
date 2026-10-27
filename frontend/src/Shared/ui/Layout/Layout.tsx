import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuthContext } from '@/Features/Auth/contexts/AuthContext'
import { useCurrentMember } from '@/Domain/Member/hooks/useMembers'
import { usePointsSubscription } from '@/Domain/Auction/hooks/useAuction'
import { useMemberLogNotifications } from '@/Domain/Log/hooks/useLogs'
import { useGuildEmojisSubscription } from '@/Domain/Emoji/hooks/useGuildEmojis'
import { EventToastProvider } from '@/Features/Events/components/EventToast/EventToast'
import { AppToastProvider } from '@/Shared/ui/components/AppToast/AppToast'
import { MemberClassIcon } from '@/Shared/ui/components/MemberClassIcon/MemberClassIcon'
import { getSocketState, type SocketState } from '@/Shared/websocket/socketClient'
import { EventHeaderTimers } from '@/Shared/ui/Layout/EventHeaderTimers'
import { SERVER_TIME_ZONE } from '@/Shared/utils/scheduleTimeZone'
import { ScheduleAlertListener } from '@/Features/Schedule/ScheduleAlertListener'
import { AuctionCreatedListener } from '@/Features/Auction/AuctionCreatedListener'
import { AuctionNavBadge } from '@/Features/Auction/components/AuctionNavBadge/AuctionNavBadge'
import { AccountDeletedListener } from '@/Features/Auth/AccountDeletedListener'
import { PartyGameInviteListener } from '@/Features/Party/PartyGameInviteListener'
import { ApprovalsListener } from '@/Features/Admin/Approvals/ApprovalsListener'
import { ApprovalsNavBadge } from '@/Features/Admin/Approvals/components/ApprovalsNavBadge/ApprovalsNavBadge'
import type { Role } from '@/Domain/types/models'
import { useEquipmentSubscription } from '@/Domain/Equipment/hooks/useEquipment'
import './Layout.styles.scss'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard' },
  { to: '/donate', label: 'Doar Disena' },
  { to: '/logs', label: 'Logs' },
  { to: '/objectives', label: 'Objetivos' },
  { to: '/events', label: 'Eventos' },
  { to: '/party', label: 'Party' },
  { to: '/items', label: 'Itens' },
  { to: '/equipment', label: 'Equipamentos' },
  { to: '/quests', label: 'Quests' },
  { to: '/auctions', label: 'Leilões' },
]

/** Reached from the member card at the top of the sidebar, not from the nav list. */
const PROFILE_ITEM = { to: '/profile', label: 'Perfil' }

const ADMIN_ITEMS: { to: string; label: string; minRole: Role }[] = [
  { to: '/admin/approvals', label: 'Aprovações', minRole: 'MODERADOR' },
]

const SOCKET_LABEL: Record<SocketState, string> = {
  connected: 'Online',
  connecting: 'Conectando',
  disconnected: 'Offline',
}

function isActive(pathname: string, to: string) {
  return pathname === to || (to !== '/' && pathname.startsWith(to))
}

function useClock() {
  const [now, setNow] = useState(() => new Date())
  const [socket, setSocket] = useState<SocketState>(getSocketState)
  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(new Date())
      setSocket(getSocketState())
    }, 1000)
    return () => window.clearInterval(id)
  }, [])
  return { now, socket }
}

export function Layout() {
  return (
    <AppToastProvider>
      <EventToastProvider>
        <LayoutShell />
      </EventToastProvider>
    </AppToastProvider>
  )
}

function LayoutShell() {
  const { logout, hasRole, user } = useAuthContext()
  const { data: member } = useCurrentMember()
  const location = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    const openEquipment = (event: KeyboardEvent) => {
      if (event.key !== 'F8' || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return
      event.preventDefault()
      navigate('/equipment')
    }
    window.addEventListener('keydown', openEquipment)
    return () => window.removeEventListener('keydown', openEquipment)
  }, [navigate])
  const { now, socket } = useClock()
  // Drawer closes itself on navigation: it is only open for the path it was opened on.
  const [drawerPath, setDrawerPath] = useState<string | null>(null)
  const drawerOpen = drawerPath === location.pathname
  const setDrawerOpen = (open: boolean) => setDrawerPath(open ? location.pathname : null)

  usePointsSubscription(user?.memberId)
  useMemberLogNotifications(user?.memberId)
  useGuildEmojisSubscription()
  useEquipmentSubscription()

  const adminItems = ADMIN_ITEMS.filter((item) => hasRole(item.minRole))
  const currentLabel =
    [...NAV_ITEMS, PROFILE_ITEM, ...ADMIN_ITEMS].find((item) => isActive(location.pathname, item.to))?.label ??
    'Terminal'
  const availableRatio =
    member && member.points > 0
      ? Math.max(0, Math.min(1, member.availablePoints / member.points))
      : 0

  return (
    <div className={`layout${drawerOpen ? ' layout--drawer-open' : ''}`}>
      <ScheduleAlertListener />
      <AuctionCreatedListener />
      <AccountDeletedListener />
      <PartyGameInviteListener />
      {hasRole('MODERADOR') && <ApprovalsListener />}
      <aside className="layout__sidebar">
        <div className="layout__brand">
          <img src="/Logo-Blacklist.png" alt="" className="layout__logo" />
          <div className="layout__brand-text">
            <span className="layout__title">Guild System</span>
            <span className="layout__subtitle">RF Online · Network</span>
          </div>
        </div>

        <div className="layout__member">
          <Link
            to={PROFILE_ITEM.to}
            className={`layout__member-head${location.pathname === PROFILE_ITEM.to ? ' layout__member-head--active' : ''}`}
            title="Abrir meu perfil"
          >
            {member?.classImageUrl ? (
              <MemberClassIcon
                classImageUrl={member.classImageUrl}
                classLabel={member.className}
                size="md"
              />
            ) : (
              <span className="layout__member-slot" aria-hidden="true" />
            )}
            <div className="layout__member-id">
              <span className="layout__member-name">{user?.nickname ?? 'Membro'}</span>
              <span className="layout__member-class">{member?.className ?? '—'}</span>
            </div>
          </Link>

          {member && (
            <div className="layout__gauge">
              <div className="layout__gauge-row">
                <span className="layout__gauge-label">Total</span>
                <span className="layout__gauge-value">{member.points}</span>
              </div>
              <div className="layout__gauge-row">
                <span className="layout__gauge-label">Disponível</span>
                <span className="layout__gauge-value layout__gauge-value--cyan">
                  {member.availablePoints}
                </span>
              </div>
              <div className="layout__gauge-bar" aria-hidden="true">
                <span style={{ width: `${availableRatio * 100}%` }} />
              </div>
            </div>
          )}
        </div>

        <nav className="layout__nav">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`layout__nav-link${isActive(location.pathname, item.to) ? ' layout__nav-link--active' : ''}`}
            >
              <span className="layout__nav-label">{item.label}</span>
              {item.to === '/auctions' && <AuctionNavBadge />}
            </Link>
          ))}

          {adminItems.length > 0 && (
            <div className="layout__admin">
              <span className="layout__admin-strip" aria-hidden="true" />
              {adminItems.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`layout__nav-link layout__nav-link--admin${isActive(location.pathname, item.to) ? ' layout__nav-link--active' : ''}`}
                >
                  <span className="layout__nav-label">{item.label}</span>
                  {item.to === '/admin/approvals' && <ApprovalsNavBadge />}
                </Link>
              ))}
            </div>
          )}
        </nav>

        <button type="button" className="layout__logout" onClick={logout}>
          Sair
        </button>
      </aside>

      <button
        type="button"
        className="layout__scrim"
        aria-label="Fechar menu"
        onClick={() => setDrawerOpen(false)}
      />

      <div className="layout__content">
        <div className="layout__status">
          <button
            type="button"
            className="layout__menu-toggle"
            aria-label="Abrir menu"
            onClick={() => setDrawerOpen(!drawerOpen)}
          >
            <span />
            <span />
            <span />
          </button>
          <h1 className="layout__page-title">{currentLabel}</h1>
          <EventHeaderTimers now={now} />
          <div className="layout__status-right">
            <span className={`layout__socket layout__socket--${socket}`} title={SOCKET_LABEL[socket]}>
              <span className="layout__socket-text">{SOCKET_LABEL[socket]}</span>
            </span>
            <span className="layout__clock layout__clock--server" title="Horário do servidor Cerberus (Moscou, UTC+3)">
              <span className="layout__clock-label">Server</span>
              {now.toLocaleTimeString('pt-BR', { timeZone: SERVER_TIME_ZONE, hour12: false })}
            </span>
            <span className="layout__clock layout__clock--local" title="Seu horário local">
              <span className="layout__clock-label">Local</span>
              {now.toLocaleTimeString('pt-BR', { hour12: false })}
            </span>
          </div>
        </div>
        <main className="layout__main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
