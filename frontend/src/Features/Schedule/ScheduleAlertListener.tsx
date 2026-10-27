import { useCallback, useRef, useState } from 'react'
import {
  useLocalScheduleAlertPolling,
  useScheduleAlertSubscription,
  type ScheduleTenMinuteAlert,
} from '@/Domain/Schedule/hooks/useScheduleAlerts'
import { useAppToast } from '@/Shared/ui/components/AppToast/AppToast'
import { playPbHqWarningSound, playTenMinuteWarningSound } from '@/Shared/utils/notificationSound'
import { onceAcrossTabs } from '@/Shared/utils/onceAcrossTabs'
import './ScheduleAlert.styles.scss'

/** Servidor manda "...:00Z" e o fallback local "...:00.000Z": compara pelo instante, não pelo texto. */
function alertDedupeKey(alert: ScheduleTenMinuteAlert) {
  const at = Date.parse(alert.startsAt)
  return `schedule-alert:${alert.eventId}|${Number.isNaN(at) ? alert.startsAt : at}`
}

export function ScheduleAlertListener() {
  const { showToast } = useAppToast()
  const [banner, setBanner] = useState<ScheduleTenMinuteAlert | null>(null)
  // O fallback local repete o aviso a cada segundo: cada aba trata cada evento uma vez.
  const seenInTab = useRef(new Set<string>())

  const onAlert = useCallback(
    (alert: ScheduleTenMinuteAlert) => {
      const key = alertDedupeKey(alert)
      if (seenInTab.current.has(key)) return
      seenInTab.current.add(key)
      // Chega pelo WebSocket e pelo fallback local, e em todas as abas: toca uma vez só.
      onceAcrossTabs(key, () => {
        if (alert.eventId === 'pb-hq') playPbHqWarningSound()
        else playTenMinuteWarningSound()
        const message = `Faltam ${alert.minutesRemaining} minutos para ${alert.label} começar`
        showToast(message, 'info', { durationMs: 12_000 })
      })
      // O banner aparece em toda aba aberta (sem som nas demais).
      setBanner(alert)
      window.setTimeout(() => setBanner(null), 12_000)
    },
    [showToast],
  )

  useScheduleAlertSubscription(onAlert)
  useLocalScheduleAlertPolling(onAlert)

  if (!banner) {
    return null
  }

  return (
    <div className="schedule-alert-banner" role="alert">
      <span className="schedule-alert-banner__icon" aria-hidden="true">!</span>
      <p className="schedule-alert-banner__text">
        Faltam <strong>{banner.minutesRemaining} minutos</strong> para{' '}
        <strong>{banner.label}</strong> começar
      </p>
    </div>
  )
}
