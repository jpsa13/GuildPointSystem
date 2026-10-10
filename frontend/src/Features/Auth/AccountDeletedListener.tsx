import { useEffect } from 'react'
import { useAuthContext } from '@/Features/Auth/contexts/AuthContext'
import { useAppToast } from '@/Shared/ui/components/AppToast/AppToast'
import { subscribeTopicEffect } from '@/Shared/websocket/socketClient'

/** Logs the member out the moment leadership deletes their account (their token is already dead). */
export function AccountDeletedListener() {
  const { user, logout } = useAuthContext()
  const { showToast } = useAppToast()
  const memberId = user?.memberId

  useEffect(() => {
    if (!memberId) return
    return subscribeTopicEffect(`/topic/account/${memberId}`, (message) => {
      const payload = JSON.parse(message.body) as { type?: string }
      if (payload.type !== 'ACCOUNT_DELETED') return
      showToast('Sua conta foi excluída pela administração da guild.', 'error', { durationMs: 10_000 })
      logout()
    })
  }, [memberId, logout, showToast])

  return null
}
