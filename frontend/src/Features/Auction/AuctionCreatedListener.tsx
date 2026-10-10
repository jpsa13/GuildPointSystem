import { useCallback } from 'react'
import { useAuctionCreatedSubscription } from '@/Domain/Auction/hooks/useAuction'
import type { Auction } from '@/Domain/types/models'
import { AuctionItemIcon } from '@/Features/Auction/components/AuctionItemIcon/AuctionItemIcon'
import { useAppToast } from '@/Shared/ui/components/AppToast/AppToast'
import { playScheduleAlertSound } from '@/Shared/utils/notificationSound'

/** Mounted once in the layout: announces every new auction to all connected members. */
export function AuctionCreatedListener() {
  const { showToast } = useAppToast()

  const onCreated = useCallback(
    (auction: Auction) => {
      const names = auction.items
        .map((item) => (item.quantity > 1 ? `${item.itemName} x${item.quantity}` : item.itemName))
        .join(', ')
      playScheduleAlertSound()
      showToast(names || `Leilão #${auction.id}`, 'info', {
        title: `Novo leilão #${String(auction.id).padStart(3, '0')}`,
        icon: <AuctionItemIcon item={auction.items[0]} size={44} />,
        link: { to: `/auctions/${auction.id}`, label: 'Ver leilão →' },
        durationMs: 15_000,
      })
    },
    [showToast],
  )

  useAuctionCreatedSubscription(onCreated)
  return null
}
