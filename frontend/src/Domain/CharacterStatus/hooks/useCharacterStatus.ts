import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/Shared/api/client'
import { onSocketReconnect, subscribeTopicEffect } from '@/Shared/websocket/socketClient'

/** Status de personagem (nome/level/EXP) enviado pelo cliente CerberusBags. */
export interface CharacterStatusView {
  memberId: number
  memberNickname: string
  gid: number
  characterName: string
  level: number
  expPercent: number
  hp: number
  hpMax: number
  fp: number
  fpMax: number
  sp: number
  spMax: number
  updatedAt: string
}

export const characterStatusKeys = {
  ranking: ['character-status', 'ranking'] as const,
  mine: ['character-status', 'mine'] as const,
}

/** Ranking da guilda: ultimo status de cada personagem que ativou o envio. */
export function useCharacterRanking() {
  return useQuery({
    queryKey: characterStatusKeys.ranking,
    queryFn: () => apiClient<CharacterStatusView[]>('/character-status/ranking'),
  })
}

export function useMyCharacterStatus() {
  return useQuery({
    queryKey: characterStatusKeys.mine,
    queryFn: () => apiClient<CharacterStatusView[]>('/character-status/me'),
  })
}

/** Atualiza o ranking sozinho quando o cliente envia um novo status (websocket). */
export function useCharacterStatusSubscription() {
  const queryClient = useQueryClient()

  useEffect(
    () =>
      subscribeTopicEffect('/topic/character-status', () => {
        queryClient.invalidateQueries({ queryKey: characterStatusKeys.ranking })
      }),
    [queryClient],
  )
  useEffect(
    () =>
      onSocketReconnect(() =>
        queryClient.invalidateQueries({ queryKey: characterStatusKeys.ranking }),
      ),
    [queryClient],
  )
}
