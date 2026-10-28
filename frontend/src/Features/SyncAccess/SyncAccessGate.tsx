import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthContext } from '@/Features/Auth/contexts/AuthContext'
import { syncAccessKeys, useSyncAccess, type SyncAccessView } from '@/Domain/CharacterStatus/hooks/useSyncAccess'
import { Button } from '@/Shared/ui/components/Button/Button'
import '@/Shared/ui/components/Button/Button.styles.scss'
import '@/Features/Auth/Auth.styles.scss'
import './SyncAccessGate.styles.scss'

/** Arquivos em frontend/public. */
const DLL_URL = '/version.rar'
const TUTORIAL_URL = '/tutorial.png'

/** O aviso fechado volta depois de tantas trocas de página (login e recarga sempre abrem). */
const NAVIGATIONS_BETWEEN_WARNINGS = 3

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
}

/** O prazo e o instante em que o bloqueio comeca (ex.: 01/11 00:00): mostra o ultimo minuto valido. */
function formatDeadline(deadline: string) {
  return new Date(new Date(deadline).getTime() - 60_000).toLocaleString('pt-BR', DATE_FORMAT)
}

function formatLastSync(lastSyncAt: string | null) {
  return lastSyncAt ? new Date(lastSyncAt).toLocaleString('pt-BR', DATE_FORMAT) : 'nunca'
}

function useNow() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

function Countdown({ deadline, now }: { deadline: string; now: number }) {
  const left = Math.max(0, new Date(deadline).getTime() - now)
  const totalSeconds = Math.floor(left / 1000)
  const parts = [
    { value: Math.floor(totalSeconds / 86_400), label: 'dias' },
    { value: Math.floor((totalSeconds % 86_400) / 3600), label: 'horas' },
    { value: Math.floor((totalSeconds % 3600) / 60), label: 'min' },
    { value: totalSeconds % 60, label: 'seg' },
  ]
  return (
    <div className="sync-gate__countdown" role="timer" aria-live="off">
      {parts.map((part) => (
        <div key={part.label} className="sync-gate__countdown-cell">
          <span className="sync-gate__countdown-value">{String(part.value).padStart(2, '0')}</span>
          <span className="sync-gate__countdown-label">{part.label}</span>
        </div>
      ))}
    </div>
  )
}

function SyncSteps() {
  return (
    <ol className="sync-gate__steps">
      <li>
        <strong>Baixe a DLL de sincronização</strong> (botão <strong>Download DLL</strong> abaixo), extraia o{' '}
        <strong>version.dll</strong> do .rar e coloque na pasta do cliente do RF Online.
      </li>
      <li>
        No <strong>launcher</strong>, abra as <strong>Settings</strong> e marque <strong>RFOnline 4gb</strong>{' '}
        (veja a imagem).
      </li>
      <li>
        Entre no jogo com o seu personagem: a sincronização é automática e este aviso some sozinho.
      </li>
    </ol>
  )
}

function SyncWindow({
  title,
  code,
  children,
  footer,
  onClose,
}: {
  title: string
  code: string
  children: ReactNode
  footer: ReactNode
  onClose?: () => void
}) {
  useEffect(() => {
    if (!onClose) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal-card sync-gate"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="sync-gate-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="auth-window-bar">
          <span id="sync-gate-title">{title}</span>
          <span className="auth-window-bar__code">{code}</span>
        </div>
        <div className="auth-card-content sync-gate__body">
          <div className="sync-gate__columns">
            <div className="sync-gate__main">{children}</div>
            <a href={TUTORIAL_URL} target="_blank" rel="noreferrer" className="sync-gate__tutorial">
              <img src={TUTORIAL_URL} alt="Settings do launcher com a opção RFOnline 4gb marcada" />
            </a>
          </div>
          <div className="sync-gate__actions">
            {/* Link com o visual do Button: download de arquivo estático precisa de <a download>. */}
            <a href={DLL_URL} download className="btn btn--primary btn--md sync-gate__download">
              Download DLL
            </a>
            {footer}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function SyncStatusLine({ sync }: { sync: SyncAccessView }) {
  return (
    <p className="sync-gate__status">
      Última sincronização: <strong>{formatLastSync(sync.lastSyncAt)}</strong> · é preciso ter sincronizado nos
      últimos {sync.windowDays} dias.
    </p>
  )
}

/** Aviso que dá para fechar: reabre no login, na recarga e a cada poucas trocas de página enquanto não sincronizar. */
function SyncWarningDialog({ sync, now, onClose }: { sync: SyncAccessView; now: number; onClose: () => void }) {
  const deadlineLabel = formatDeadline(sync.deadline)
  return (
    <SyncWindow
      title={sync.newAccount ? 'Conta nova · sincronize seu personagem' : 'Conta dessincronizada'}
      code="DLL"
      onClose={onClose}
      footer={
        <Button type="button" variant="primary" onClick={onClose}>
          Entendi
        </Button>
      }
    >
      {sync.newAccount ? (
        <p className="sync-gate__lead">
          Bem-vindo à guilda! Contas novas têm <strong>24 horas</strong> a partir do cadastro para sincronizar o
          personagem com a DLL. Depois de <strong>{deadlineLabel}</strong> o site só abre para contas sincronizadas.
        </p>
      ) : (
        <p className="sync-gate__lead">
          Sua conta está <strong>dessincronizada</strong>: não recebemos dados do seu personagem pela DLL. A partir de{' '}
          <strong>{deadlineLabel}</strong> (horário de Brasília) o acesso ao site passa a ser{' '}
          <strong>exclusivo para contas sincronizadas</strong>.
        </p>
      )}
      <Countdown deadline={sync.deadline} now={now} />
      <SyncSteps />
      <SyncStatusLine sync={sync} />
    </SyncWindow>
  )
}

/** Depois do prazo: sem fechar, sem o site por trás. Libera sozinho quando o jogo sincronizar. */
function SyncBlockedScreen({ sync, onLogout }: { sync: SyncAccessView; onLogout: () => void }) {
  return (
    <SyncWindow
      title="Acesso bloqueado · conta não sincronizada"
      code="DLL"
      footer={
        <Button type="button" variant="secondary" onClick={onLogout}>
          Sair
        </Button>
      }
    >
      <p className="sync-gate__lead">
        O prazo terminou em <strong>{formatDeadline(sync.deadline)}</strong>. Agora o site é{' '}
        <strong>exclusivo para contas sincronizadas</strong> com a DLL. Faça os passos abaixo e entre no jogo: o
        acesso é liberado automaticamente.
      </p>
      <SyncSteps />
      <SyncStatusLine sync={sync} />
    </SyncWindow>
  )
}

/**
 * Exige a DLL de sincronização. Antes do prazo mostra um aviso (fechável) com contador regressivo;
 * depois, troca o site inteiro por uma tela de bloqueio até o personagem sincronizar.
 */
export function SyncAccessGate({ children }: { children: ReactNode }) {
  const { user, logout } = useAuthContext()
  const { data: sync } = useSyncAccess(user?.memberId)
  const queryClient = useQueryClient()
  const location = useLocation()
  const now = useNow()
  // Trocas de página desde que o Layout montou (login/recarga zeram) e em qual delas o aviso foi fechado.
  const [navigation, setNavigation] = useState({ key: location.key, count: 0 })
  const [dismissedAt, setDismissedAt] = useState<number | null>(null)
  if (navigation.key !== location.key) {
    setNavigation({ key: location.key, count: navigation.count + 1 })
  }

  const deadlinePassed = !!sync && now >= new Date(sync.deadline).getTime()
  const blocked = !!sync && !sync.synced && (sync.blocked || deadlinePassed)

  // O contador zerou com a página aberta: confirma com o servidor.
  useEffect(() => {
    if (sync && !sync.synced && deadlinePassed && !sync.blocked) {
      queryClient.invalidateQueries({ queryKey: syncAccessKeys.me })
    }
  }, [sync, deadlinePassed, queryClient])

  if (blocked) return <SyncBlockedScreen sync={sync} onLogout={logout} />

  const showWarning =
    !!sync &&
    !sync.synced &&
    (dismissedAt === null || navigation.count - dismissedAt >= NAVIGATIONS_BETWEEN_WARNINGS)

  return (
    <>
      {children}
      {showWarning && <SyncWarningDialog sync={sync} now={now} onClose={() => setDismissedAt(navigation.count)} />}
    </>
  )
}
