import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/Shared/api/client'
import { onSocketReconnect, subscribeTopicEffect } from '@/Shared/websocket/socketClient'

export interface AuctionViewer {
  memberId: number
  nickname: string
  className: string | null
  classImageUrl: string | null
  /** Every tab the member has on this auction is in the background. */
  idle: boolean
}

export const auctionViewerKeys = {
  list: (auctionId: number) => ['presence', 'auction', auctionId] as const,
}

/** Members with this auction open; the backend pushes the full list whenever it changes. */
export function useAuctionViewers(auctionId: number) {
  const queryClient = useQueryClient()

  useEffect(
    () =>
      subscribeTopicEffect(`/topic/auctions/${auctionId}/viewers`, (message) => {
        queryClient.setQueryData(auctionViewerKeys.list(auctionId), JSON.parse(message.body) as AuctionViewer[])
      }),
    [auctionId, queryClient],
  )
  useEffect(
    () => onSocketReconnect(() => queryClient.invalidateQueries({ queryKey: auctionViewerKeys.list(auctionId) })),
    [auctionId, queryClient],
  )

  return useQuery({
    queryKey: auctionViewerKeys.list(auctionId),
    queryFn: () => apiClient<AuctionViewer[]>(`/presence/auctions/${auctionId}`),
    staleTime: Infinity,
  })
}
