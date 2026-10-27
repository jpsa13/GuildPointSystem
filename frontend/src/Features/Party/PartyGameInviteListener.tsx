import { useEffect } from 'react'
import { useAuthContext } from '@/Features/Auth/contexts/AuthContext'
import { useAppToast } from '@/Shared/ui/components/AppToast/AppToast'
import { playPartyInviteSound } from '@/Shared/utils/notificationSound'
import { onceAcrossTabs } from '@/Shared/utils/onceAcrossTabs'
import { subscribeTopicEffect } from '@/Shared/websocket/socketClient'

/** O líder chamou a PT pelo jogo ("Chamar todos no jogo"): avisa o convidado em qualquer página, com som. */
export function PartyGameInviteListener() {
  const { user } = useAuthContext()
  const { showToast } = useAppToast()
  const memberId = user?.memberId

  useEffect(() => {
    if (!memberId) return
    return subscribeTopicEffect(`/topic/parties/member/${memberId}`, (message) => {
      let payload: { type?: string; message?: string; inviteId?: string }
      try { payload = JSON.parse(message.body) } catch { return }
      if (payload.type !== 'PARTY_GAME_INVITE' || !payload.inviteId) return
      onceAcrossTabs(`party-game-invite:${payload.inviteId}`, () => {
        playPartyInviteSound()
        showToast(payload.message ?? 'Você foi convidado para a PT no jogo.', 'info')
      })
    })
  }, [memberId, showToast])

  return null
}
