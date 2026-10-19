import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { CerberusCountdown } from '@/Features/ServerInfo/components/CerberusCountdown'
import { useCerberusLaunched } from '@/Features/ServerInfo/hooks/useCerberusLaunched'
import './Auth.styles.scss'

/**
 * Layout route that wraps /login and /register.
 * Stays mounted during navigation between the two so CSS transitions
 * and the ResizeObserver height animation play smoothly.
 */
export function AuthShell() {
  const { pathname } = useLocation()
  const isRegister = pathname.includes('register')
  const cerberusLaunched = useCerberusLaunched()

  // ── Animated height ────────────────────────────────────────────────────────
  // The outer "body" wrapper gets an explicit height that CSS-transitions.
  // The inner "content" div is what ResizeObserver measures.
  const contentRef = useRef<HTMLDivElement>(null)
  const [bodyHeight, setBodyHeight] = useState<number | null>(null)

  // Set initial height before the browser paints so there's zero flash.
  useLayoutEffect(() => {
    if (contentRef.current) {
      setBodyHeight(contentRef.current.offsetHeight)
    }
  }, [])

  // Re-measure whenever anything inside the form changes height.
  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setBodyHeight(el.offsetHeight)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="auth-stage">
      <header className="auth-topbar">
        <span className="auth-topbar__brand">Rising Force · Guild Network</span>
        <span className="auth-topbar__hazard" aria-hidden="true" />
        <span className="auth-topbar__tag">BUILD 2.0</span>
      </header>

      <section className="auth-cerberus">
        {!cerberusLaunched && <CerberusCountdown />}
        <Link to="/server-info" className="auth-cerberus__topics-link">
          Informações do servidor Cerberus (tópicos traduzidos)
        </Link>
      </section>

      <div className="auth-layout">
        {/* ── Lore / launcher news panel ──────────────────────────────────── */}
        <aside className="auth-lore">
          <img src="/Logo-Blacklist.png" alt="Blacklist" className="auth-logo" />
          <p className="lore-eyebrow">Terminal da guild</p>
          <p className="lore-desc">
            Pontos, leilões e eventos sincronizados em tempo real entre os membros.
          </p>
        </aside>

        {/* ── Access window (width animates via CSS transition + class) ───── */}
        <div className={`auth-panel${isRegister ? ' auth-panel--wide' : ''}`}>
          <div className="auth-card">
            <div className="auth-window-bar">
              <span>{isRegister ? 'Novo registro' : 'Terminal de acesso'}</span>
              <span className="auth-window-bar__code">SEC-{isRegister ? '02' : '01'}</span>
            </div>
            {/*
             * This div's height is driven by JS (ResizeObserver) so CSS can
             * transition it. The inner div is what gets measured.
             */}
            <div
              className="auth-card-body"
              style={{
                height: bodyHeight !== null ? `${bodyHeight}px` : 'auto',
                overflow: 'hidden',
                transition: bodyHeight !== null
                  ? 'height 0.42s cubic-bezier(0.4, 0, 0.2, 1)'
                  : 'none',
              }}
            >
              <div ref={contentRef} className="auth-card-content">
                <div className="auth-tabs">
                  <Link
                    to="/login"
                    className={`auth-tab${!isRegister ? ' active' : ''}`}
                  >
                    Entrar
                  </Link>
                  <Link
                    to="/register"
                    className={`auth-tab${isRegister ? ' active' : ''}`}
                  >
                    Cadastro
                  </Link>
                </div>

                {/* Actual page content (LoginPage or RegisterPage) */}
                <Outlet />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
