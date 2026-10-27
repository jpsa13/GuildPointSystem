import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScheduleTenMinuteAlert } from '@/Domain/Schedule/hooks/useScheduleAlerts'
import { ScheduleAlertListener } from './ScheduleAlertListener'

const state = vi.hoisted(() => ({
  ws: undefined as ((a: ScheduleTenMinuteAlert) => void) | undefined,
  local: undefined as ((a: ScheduleTenMinuteAlert) => void) | undefined,
  pbHq: vi.fn(), warning: vi.fn(), toast: vi.fn(),
}))
vi.mock('@/Domain/Schedule/hooks/useScheduleAlerts', () => ({
  useScheduleAlertSubscription: (fn: (a: ScheduleTenMinuteAlert) => void) => { state.ws = fn },
  useLocalScheduleAlertPolling: (fn: (a: ScheduleTenMinuteAlert) => void) => { state.local = fn },
}))
vi.mock('@/Shared/ui/components/AppToast/AppToast', () => ({ useAppToast: () => ({ showToast: state.toast }) }))
vi.mock('@/Shared/utils/notificationSound', () => ({
  playPbHqWarningSound: state.pbHq, playTenMinuteWarningSound: state.warning,
}))

const pbHq = (startsAt: string): ScheduleTenMinuteAlert =>
  ({ type: 'SCHEDULE_TEN_MINUTE', eventId: 'pb-hq', label: 'PB HQ', minutesRemaining: 10, startsAt })

beforeEach(() => { localStorage.clear(); state.pbHq.mockReset(); state.warning.mockReset(); state.toast.mockReset() })
afterEach(cleanup)

async function fire(source: 'ws' | 'local', alert: ScheduleTenMinuteAlert) {
  await act(async () => { state[source]!(alert) })
}

describe('ScheduleAlertListener', () => {
  it('toca o aviso da PB HQ uma vez quando servidor e fallback local mandam o mesmo evento', async () => {
    render(<ScheduleAlertListener />)
    await fire('ws', pbHq('2026-10-27T23:00:00Z'))
    await fire('local', pbHq('2026-10-27T23:00:00.000Z'))
    await fire('local', pbHq('2026-10-27T23:00:00.000Z'))
    expect(state.pbHq).toHaveBeenCalledTimes(1)
    expect(state.toast).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert')).toHaveTextContent('PB HQ')
  })

  it('não toca de novo numa segunda aba', async () => {
    render(<ScheduleAlertListener />)
    await fire('ws', pbHq('2026-10-27T23:00:00Z'))
    cleanup()
    render(<ScheduleAlertListener />) // outra aba: mesmo localStorage, memória nova
    await fire('local', pbHq('2026-10-27T23:00:00.000Z'))
    expect(state.pbHq).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert')).toHaveTextContent('PB HQ')
  })

  it('avisa de novo na próxima ocorrência', async () => {
    render(<ScheduleAlertListener />)
    await fire('ws', pbHq('2026-10-27T23:00:00Z'))
    await fire('ws', pbHq('2026-10-28T23:00:00Z'))
    expect(state.pbHq).toHaveBeenCalledTimes(2)
  })
})
