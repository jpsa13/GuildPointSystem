/** Fuso dos eventos de servidor (alinhado ao backend). */
export const SCHEDULE_TIME_ZONE = 'America/Sao_Paulo'

/** Fuso do servidor Cerberus (Moscou, UTC+3): 00:00 lá = 18:00 em Brasília. */
export const SERVER_TIME_ZONE = 'Europe/Moscow'

interface ZonedParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  const parts = fmt.formatToParts(date)
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0')
  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    hour: pick('hour'),
    minute: pick('minute'),
    second: pick('second'),
  }
}

/** Instante UTC para um horário civil em `timeZone`. */
export function zonedLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0))
  for (let i = 0; i < 4; i++) {
    const z = getZonedParts(guess, timeZone)
    const targetMin = hour * 60 + minute
    const actualMin = z.hour * 60 + z.minute
    const dayDiff = day - z.day
    const minDiff = targetMin - actualMin + dayDiff * 24 * 60
    if (minDiff === 0 && z.year === year && z.month === month) {
      return guess
    }
    guess = new Date(guess.getTime() + minDiff * 60 * 1000)
  }
  return guess
}
