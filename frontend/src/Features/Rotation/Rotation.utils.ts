import type { Guild, RotationSlot } from '@/Domain/Rotation/hooks/useRotation'

export function rotationTime(time: string, offset: number) {
  const [hour, minute] = time.split(':').map(Number)
  const shifted = hour + offset
  return `${String(shifted % 24).padStart(2, '0')}:${String(minute).padStart(2, '0')}${shifted >= 24 ? ' +1' : ''}`
}
export function rotationTotals(slots: RotationSlot[], guild: Guild) {
  const count = (area: 'qg' | 'outpost') => slots.flatMap(s => s[area]).filter(a => a.guild === guild).reduce((n, a) => n + a.bosses.length, 0)
  return { qg: count('qg'), outpost: count('outpost') }
}
