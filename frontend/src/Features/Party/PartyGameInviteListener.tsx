import { useEffect } from 'react'
import { useAuthContext } from '@/Features/Auth/contexts/AuthContext'
import { useAppToast } from '@/Shared/ui/components/AppToast/AppToast'
import { playPartyInviteSound } from '@/Shared/utils/notificationSound'
import { subscribeTopicEffect } from '@/Shared/websocket/socketClient'

const SEEN_PREFIX = 'party-game-invite:'

/** Marca o chamado como avisado; false se outra aba (ou entrega repetida) já avisou. */
function claimInvite(inviteId: string): boolean {
  try {
    const key = SEEN_PREFIX + inviteId
    if (localStorage.getItem(key)) return false
    localStorage.setItem(key, String(Date.now()))
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k?.startsWith(SEEN_PREFIX) && Date.now() - Number(localStorage.getItem(k)) > 3_600_000) localStorage.removeItem(k)
    }
  } catch {
    /* sem storage: avisa nesta aba */
  }
  return true
}

/** Abas abertas recebem o mesmo aviso juntas: o lock deixa só uma tocar o som. */
function onceAcrossTabs(inviteId: string, run: () => void) {
  if (!navigator.locks) {
    if (claimInvite(inviteId)) run()
    return
  }
  void navigator.locks.request(SEEN_PREFIX + inviteId, () => {
    if (claimInvite(inviteId)) run()
  })
}

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
      onceAcrossTabs(payload.inviteId, () => {
        playPartyInviteSound()
        showToast(payload.message ?? 'Você foi convidado para a PT no jogo.', 'info')
      })
    })
  }, [memberId, showToast])

  return null
}
