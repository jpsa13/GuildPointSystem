import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import './AppToast.styles.scss'

export type ToastType = 'success' | 'error' | 'info'

interface ToastLink {
  to: string
  label: string
}

interface Toast {
  id: number
  message: string
  type: ToastType
  durationMs: number
  title?: string
  imageUrl?: string | null
  icon?: ReactNode
  link?: ToastLink
}

interface ShowToastOptions {
  durationMs?: number
  title?: string
  imageUrl?: string | null
  /** Custom visual (e.g. a game sprite); takes precedence over `imageUrl`. */
  icon?: ReactNode
  link?: ToastLink
}

interface AppToastContextValue {
  showToast: (message: string, type?: ToastType, options?: ShowToastOptions) => void
}

const AppToastContext = createContext<AppToastContextValue | null>(null)

let counter = 0

export function AppToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const showToast = useCallback(
    (message: string, type: ToastType = 'success', options?: ShowToastOptions) => {
      const id = ++counter
      const durationMs = options?.durationMs ?? 3500
      setToasts((prev) => [
        ...prev,
        {
          id,
          message,
          type,
          durationMs,
          title: options?.title,
          imageUrl: options?.imageUrl,
          icon: options?.icon,
          link: options?.link,
        },
      ])
      const timer = setTimeout(() => dismiss(id), durationMs)
      timers.current.set(id, timer)
    },
    [dismiss],
  )

  return (
    <AppToastContext.Provider value={{ showToast }}>
      {children}
      <div className="app-toasts">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`app-toast app-toast--${t.type}${t.icon || t.imageUrl ? ' app-toast--rich' : ''}`}
            style={{ '--toast-life': `${t.durationMs}ms` } as React.CSSProperties}
          >
            {t.icon ? (
              <span className="app-toast__image">{t.icon}</span>
            ) : t.imageUrl ? (
              <img src={t.imageUrl} alt="" className="app-toast__image" />
            ) : (
              <span className="app-toast__icon">
                {t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : 'ℹ'}
              </span>
            )}
            <span className="app-toast__body">
              {t.title && <strong className="app-toast__title">{t.title}</strong>}
              <span className="app-toast__msg">{t.message}</span>
              {t.link && (
                <Link to={t.link.to} className="app-toast__link" onClick={() => dismiss(t.id)}>
                  {t.link.label}
                </Link>
              )}
            </span>
            <button type="button" className="app-toast__close" onClick={() => dismiss(t.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </AppToastContext.Provider>
  )
}

export function useAppToast() {
  const ctx = useContext(AppToastContext)
  if (!ctx) throw new Error('useAppToast must be used within AppToastProvider')
  return ctx
}
