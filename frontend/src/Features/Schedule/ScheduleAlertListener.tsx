import { useCallback, useState } from 'react'
import {
  useLocalScheduleAlertPolling,
  useScheduleAlertSubscription,
  type ScheduleTenMinuteAlert,
} from '@/Domain/Schedule/hooks/useScheduleAlerts'
import { useAppToast } from '@/Shared/ui/components/AppToast/AppToast'
import { playPbHqWarningSound, playTenMinuteWarningSound } from '@/Shared/utils/notificationSound'
import './ScheduleAlert.styles.scss'

function alertDedupeKey(alert: ScheduleTenMinuteAlert) {
  return `${alert.eventId}|${alert.startsAt}`
}

function markAlertShown(key: string) {
  try {
    sessionStorage.setItem(`schedule-alert:${key}`, '1')
  } catch {
    /* ignore */
  }
}

function wasAlertShown(key: string) {
  try {
    return sessionStorage.getItem(`schedule-alert:${key}`) === '1'
  } catch {
    return false
  }
}

export function ScheduleAlertListener() {
  const { showToast } = useAppToast()
  const [banner, setBanner] = useState<ScheduleTenMinuteAlert | null>(null)

  const onAlert = useCallback(
    (alert: ScheduleTenMinuteAlert) => {
      const key = alertDedupeKey(alert)
      if (wasAlertShown(key)) {
        return
      }
      markAlertShown(key)

      if (alert.eventId === 'pb-hq') playPbHqWarningSound()
      else playTenMinuteWarningSound()
      const message = `Faltam ${alert.minutesRemaining} minutos para ${alert.label} começar`
      showToast(message, 'info', { durationMs: 12_000 })
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
