import { useAuctions } from '@/Domain/Auction/hooks/useAuction'
import { isAuctionFinished, type Auction } from '@/Domain/types/models'
import { AuctionItemIcon } from '@/Features/Auction/components/AuctionItemIcon/AuctionItemIcon'
import { formatTime, useCountdown } from '@/Features/Auction/hooks/useCountdown'
import { NavBadge } from '@/Shared/ui/components/NavBadge/NavBadge'

function PopoverRow({ auction }: { auction: Auction }) {
  const remaining = useCountdown(auction.endsAt)
  const running = auction.status === 'OPEN' || auction.status === 'DOLE'
  return (
    <li className="nav-popover__row">
      <AuctionItemIcon item={auction.items[0]} size={24} />
      <span className="nav-popover__name">
        {auction.items.map((i) => (i.quantity > 1 ? `${i.itemName} x${i.quantity}` : i.itemName)).join(', ')}
      </span>
      <span className="nav-popover__time">{running ? formatTime(remaining) : 'Empate'}</span>
    </li>
  )
}

/** Sidebar bubble with the number of active auctions; hovering it lists their items. */
export function AuctionNavBadge() {
  const { data: auctions = [] } = useAuctions()
  const active = auctions.filter((a) => !isAuctionFinished(a.status))

  return (
    <NavBadge count={active.length} ariaLabel={`${active.length} leilão(ões) ativo(s)`} title="Leilões ativos">
      {active.map((a) => (
        <PopoverRow key={a.id} auction={a} />
      ))}
    </NavBadge>
  )
}
