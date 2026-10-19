import {
  getZonedParts,
  SCHEDULE_TIME_ZONE,
  SERVER_TIME_ZONE,
  zonedLocalToUtc,
} from '@/Shared/utils/scheduleTimeZone'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const TZ = SCHEDULE_TIME_ZONE

export function getNextDailyOccurrence(
  hour: number,
  minute: number,
  now: Date,
  timeZone: string = TZ,
): Date {
  const z = getZonedParts(now, timeZone)
  let candidate = zonedLocalToUtc(z.year, z.month, z.day, hour, minute, timeZone)
  if (now.getTime() >= candidate.getTime()) {
    const tomorrow = new Date(candidate.getTime() + MS_PER_DAY)
    const tz = getZonedParts(tomorrow, timeZone)
    candidate = zonedLocalToUtc(tz.year, tz.month, tz.day, hour, minute, timeZone)
  }
  return candidate
}

export function getMsUntilNextDailyEvent(hour: number, minute: number, now: Date): number {
  const next = getNextDailyOccurrence(hour, minute, now)
  return Math.max(0, next.getTime() - now.getTime())
}

/** Próxima ocorrência em anchor + k·intervalDays (k inteiro), após `now`. */
export function getNextIntervalOccurrence(anchor: Date, intervalDays: number, now: Date): Date {
  const intervalMs = intervalDays * MS_PER_DAY
  const anchorMs = anchor.getTime()
  if (now.getTime() < anchorMs) {
    return new Date(anchorMs)
  }
  const elapsed = now.getTime() - anchorMs
  const periods = Math.floor(elapsed / intervalMs) + 1
  return new Date(anchorMs + periods * intervalMs)
}

export function getMsUntilNextIntervalEvent(anchor: Date, intervalDays: number, now: Date): number {
  const next = getNextIntervalOccurrence(anchor, intervalDays, now)
  return Math.max(0, next.getTime() - now.getTime())
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

/** HH:MM:SS ou Nd HH:MM:SS quando passa de 24h. */
export function formatHmsCountdown(totalMs: number): string {
  const totalSec = Math.floor(totalMs / 1000)
  const days = Math.floor(totalSec / 86400)
  const h = Math.floor((totalSec % 86400) / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const time = `${pad2(h)}:${pad2(m)}:${pad2(s)}`
  return days > 0 ? `${days}d ${time}` : time
}

export type DailyScheduledEvent = {
  kind: 'daily'
  id: string
  label: string
  hour: number
  minute: number
  /** Fuso em que hour/minute são definidos; padrão Brasília. */
  timeZone?: string
}

export type IntervalScheduledEvent = {
  kind: 'interval'
  id: string
  label: string
  intervalDays: number
  /** Uma ocorrência conhecida do ciclo (hora já embutida no Date). */
  anchor: Date
}

export type ScheduledEvent = DailyScheduledEvent | IntervalScheduledEvent

export function getScheduledOccurrenceStart(event: ScheduledEvent, now: Date): Date {
  if (event.kind === 'daily') {
    return getNextDailyOccurrence(event.hour, event.minute, now, event.timeZone)
  }
  return getNextIntervalOccurrence(event.anchor, event.intervalDays, now)
}

export function getMsUntilScheduledEvent(event: ScheduledEvent, now: Date): number {
  const next = getScheduledOccurrenceStart(event, now)
  return Math.max(0, next.getTime() - now.getTime())
}

export const TEN_MINUTE_WARNING_MS = 10 * 60 * 1000

/** Próximo PB Major: domingo 27/09/2026 19:00 (Brasília), depois a cada 4 dias. */
const PBS_MAJOR_ANCHOR = zonedLocalToUtc(2026, 9, 27, 19, 0, TZ)

function devTestScheduleEvent(): IntervalScheduledEvent | null {
  if (!import.meta.env.DEV) return null
  const leadSeconds = 12
  return {
    kind: 'interval',
    id: 'test-alert',
    label: 'TESTE',
    intervalDays: 10_000,
    anchor: new Date(Date.now() + 10 * 60 * 1000 + leadSeconds * 1000),
  }
}

const devTestEvent = devTestScheduleEvent()

export const HEADER_SCHEDULED_EVENTS: ScheduledEvent[] = [
  ...(devTestEvent ? [devTestEvent] : []),
  // CW no horário do servidor: 06:00 / 14:00 / 22:00 (= 00:00 / 08:00 / 16:00 Brasília).
  { kind: 'daily', id: 'cw1', label: 'CW1', hour: 6, minute: 0, timeZone: SERVER_TIME_ZONE },
  { kind: 'daily', id: 'cw2', label: 'CW2', hour: 14, minute: 0, timeZone: SERVER_TIME_ZONE },
  { kind: 'daily', id: 'cw3', label: 'CW3', hour: 22, minute: 0, timeZone: SERVER_TIME_ZONE },
  { kind: 'daily', id: 'pbs-elan', label: 'PB Elan', hour: 19, minute: 0 },
  {
    kind: 'interval',
    id: 'pbs-major',
    label: 'PB Major',
    intervalDays: 4,
    anchor: PBS_MAJOR_ANCHOR,
  },
]
