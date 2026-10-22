import { useCallback } from 'react'
import { usePendingApprovalsSubscription, type PendingMemberNotice } from '@/Domain/Member/hooks/useMembers'
import { useAppToast } from '@/Shared/ui/components/AppToast/AppToast'
import { playScheduleAlertSound } from '@/Shared/utils/notificationSound'

/** Mounted in the layout for moderators: announces every new registration awaiting approval. */
export function ApprovalsListener() {
  const { showToast } = useAppToast()

  const onPending = useCallback(
    (notice: PendingMemberNotice) => {
      playScheduleAlertSound()
      showToast(notice.nickname, 'info', {
        title: 'Novo cadastro pendente',
        link: { to: '/admin/approvals', label: 'Ver aprovações →' },
        durationMs: 15_000,
      })
    },
    [showToast],
  )

  usePendingApprovalsSubscription(onPending)
  return null
}
