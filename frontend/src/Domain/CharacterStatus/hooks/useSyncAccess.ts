import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/Shared/api/client'
import { onSocketReconnect, subscribeTopicEffect } from '@/Shared/websocket/socketClient'
import type { CharacterStatusView } from './useCharacterStatus'

/** Situacao da DLL de sincronizacao do membro logado (aviso antes do prazo, bloqueio depois). */
export interface SyncAccessView {
  synced: boolean
  lastSyncAt: string | null
  deadline: string
  /** Prazo contado do cadastro (contas criadas depois do prazo geral). */
  newAccount: boolean
  blocked: boolean
  windowDays: number
}

export const syncAccessKeys = {
  me: ['character-status', 'sync-access'] as const,
}

export function useSyncAccess(memberId: number | undefined) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: syncAccessKeys.me,
    queryFn: () => apiClient<SyncAccessView>('/character-status/sync-access'),
    enabled: memberId != null,
    // Sem sincronizar: confere de tempos em tempos (o websocket pode estar fora para quem esta bloqueado).
    refetchInterval: (q) => (q.state.data && !q.state.data.synced ? 30_000 : false),
  })

  // O jogo enviou dados deste membro: libera o aviso/bloqueio na hora.
  useEffect(
    () =>
      subscribeTopicEffect('/topic/character-status', (message) => {
        const status = JSON.parse(message.body) as CharacterStatusView
        if (status.memberId === memberId) {
          queryClient.invalidateQueries({ queryKey: syncAccessKeys.me })
        }
      }),
    [queryClient, memberId],
  )
  useEffect(
    () => onSocketReconnect(() => queryClient.invalidateQueries({ queryKey: syncAccessKeys.me })),
    [queryClient],
  )

  return query
}
