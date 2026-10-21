import { useEffect, useState } from 'react'
import {
  CERBERUS_LAUNCH,
  CERBERUS_PREMIUM_ACCESS,
} from '@/Features/ServerInfo/hooks/useCerberusLaunched'
import './CerberusCountdown.styles.scss'

function pad(n: number) {
  return String(n).padStart(2, '0')
}

interface CerberusCountdownProps {
  /** Single-row strip for in-app pages; the default is the large login banner. */
  compact?: boolean
}

/** True once premium early access has started; the countdown then targets the official opening. */
function isPremiumOpen() {
  return Date.now() >= CERBERUS_PREMIUM_ACCESS.getTime()
}

/** Countdown to the Cerberus launch in two stages; renders nothing once the official opening arrives. */
export function CerberusCountdown({ compact = false }: CerberusCountdownProps) {
  const [parts, setParts] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 })
  const [premiumOpen, setPremiumOpen] = useState(isPremiumOpen)
  const [done, setDone] = useState(() => Date.now() >= CERBERUS_LAUNCH.getTime())

  useEffect(() => {
    const tick = () => {
      const premium = isPremiumOpen()
      setPremiumOpen(premium)
      const target = premium ? CERBERUS_LAUNCH : CERBERUS_PREMIUM_ACCESS
      const diff = target.getTime() - Date.now()
      if (diff <= 0 && premium) {
        setDone(true)
        window.clearInterval(id)
        return
      }
      const totalSec = Math.max(0, Math.floor(diff / 1000))
      setParts({
        days: Math.floor(totalSec / 86400),
        hours: Math.floor((totalSec % 86400) / 3600),
        minutes: Math.floor((totalSec % 3600) / 60),
        seconds: totalSec % 60,
      })
    }
    const id = window.setInterval(tick, 1000)
    tick()
    return () => window.clearInterval(id)
  }, [])

  if (done) return null

  const heading = (
    <>
      <h2 className="cerberus-banner__title">CERBERUS GAMES Inc</h2>
      <p className="cerberus-banner__date">
        {premiumOpen
          ? 'Premium liberado · abertura oficial às 09:00 (Brasília)'
          : 'Sáb, 24 de outubro · premium às 07:00 · oficial às 09:00 (Brasília)'}
      </p>
    </>
  )

  return (
    <section
      className={`cerberus-banner${compact ? ' cerberus-banner--compact' : ''}`}
      aria-label="Contagem regressiva Cerberus"
    >
      {compact ? (
        <div className="cerberus-banner__heading">
          <img src="/logo.png" alt="" className="cerberus-banner__logo" />
          <div>{heading}</div>
        </div>
      ) : (
        <>
          <img src="/logo.png" alt="" className="cerberus-banner__logo" />
          {heading}
        </>
      )}
      <div className="cerberus-banner__timer" role="timer">
        <div className="cerberus-banner__unit">
          <span className="cerberus-banner__value">{pad(parts.days)}</span>
          <span className="cerberus-banner__label">dias</span>
        </div>
        <span className="cerberus-banner__sep">:</span>
        <div className="cerberus-banner__unit">
          <span className="cerberus-banner__value">{pad(parts.hours)}</span>
          <span className="cerberus-banner__label">horas</span>
        </div>
        <span className="cerberus-banner__sep">:</span>
        <div className="cerberus-banner__unit">
          <span className="cerberus-banner__value">{pad(parts.minutes)}</span>
          <span className="cerberus-banner__label">min</span>
        </div>
        <span className="cerberus-banner__sep">:</span>
        <div className="cerberus-banner__unit">
          <span className="cerberus-banner__value">{pad(parts.seconds)}</span>
          <span className="cerberus-banner__label">seg</span>
        </div>
      </div>
    </section>
  )
}
