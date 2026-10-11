import { useEffect, useMemo, useState } from 'react'
import './CerberusCountdown.styles.scss'

/** Próximo 24 de outubro (horário de Brasília). */
function getTargetDate(): Date {
  const now = new Date()
  const year = now.getFullYear()
  const target = new Date(`${year}-10-24T00:00:00-03:00`)
  if (now.getTime() >= target.getTime()) {
    return new Date(`${year + 1}-10-24T00:00:00-03:00`)
  }
  return target
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

interface CerberusCountdownProps {
  /** Single-row strip for in-app pages; the default is the large login banner. */
  compact?: boolean
}

export function CerberusCountdown({ compact = false }: CerberusCountdownProps) {
  const target = useMemo(() => getTargetDate(), [])
  const [parts, setParts] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 })
  const [done, setDone] = useState(false)

  useEffect(() => {
    const tick = () => {
      const diff = target.getTime() - Date.now()
      if (diff <= 0) {
        setDone(true)
        setParts({ days: 0, hours: 0, minutes: 0, seconds: 0 })
        return
      }
      const totalSec = Math.floor(diff / 1000)
      setParts({
        days: Math.floor(totalSec / 86400),
        hours: Math.floor((totalSec % 86400) / 3600),
        minutes: Math.floor((totalSec % 3600) / 60),
        seconds: totalSec % 60,
      })
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [target])

  const heading = (
    <>
      <h2 className="cerberus-banner__title">CERBERUS GAMES Inc</h2>
      <p className="cerberus-banner__date">
        Contagem para 24 de outubro de {target.getFullYear()}
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
      {done ? (
        <p className="cerberus-banner__live">Evento em andamento</p>
      ) : (
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
      )}
    </section>
  )
}
