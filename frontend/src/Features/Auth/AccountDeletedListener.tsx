import { useEffect } from 'react'
import { useAuthContext } from '@/Features/Auth/contexts/AuthContext'
import { useAppToast } from '@/Shared/ui/components/AppToast/AppToast'
import { subscribeTopicEffect } from '@/Shared/websocket/socketClient'

/** Logs the member out the moment leadership deletes or suspends their account (their token is already dead). */
const ACCOUNT_NOTICES: Record<string, string> = {
  ACCOUNT_DELETED: 'Sua conta foi excluída pela administração da guild.',
  ACCOUNT_SUSPENDED: 'Sua conta foi suspensa pela administração da guild.',
}

export function AccountDeletedListener() {
  const { user, logout } = useAuthContext()
  const { showToast } = useAppToast()
  const memberId = user?.memberId

  useEffect(() => {
    if (!memberId) return
    return subscribeTopicEffect(`/topic/account/${memberId}`, (message) => {
      const payload = JSON.parse(message.body) as { type?: string }
      const notice = ACCOUNT_NOTICES[payload.type ?? '']
      if (!notice) return
      showToast(notice, 'error', { durationMs: 10_000 })
      logout()
    })
  }, [memberId, logout, showToast])

  return null
}
