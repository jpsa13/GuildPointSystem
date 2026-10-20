import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuctions } from '@/Domain/Auction/hooks/useAuction'
import { isAuctionFinished, type Auction } from '@/Domain/types/models'
import { AuctionItemIcon } from '@/Features/Auction/components/AuctionItemIcon/AuctionItemIcon'
import { formatTime, useCountdown } from '@/Features/Auction/hooks/useCountdown'
import './AuctionNavBadge.styles.scss'

function PopoverRow({ auction }: { auction: Auction }) {
  const remaining = useCountdown(auction.endsAt)
  const running = auction.status === 'OPEN' || auction.status === 'DOLE'
  return (
    <li className="auction-nav-popover__row">
      <AuctionItemIcon item={auction.items[0]} size={24} />
      <span className="auction-nav-popover__name">
        {auction.items.map((i) => (i.quantity > 1 ? `${i.itemName} x${i.quantity}` : i.itemName)).join(', ')}
      </span>
      <span className="auction-nav-popover__time">{running ? formatTime(remaining) : 'Empate'}</span>
    </li>
  )
}

/** Sidebar bubble with the number of active auctions; hovering it lists their items. */
export function AuctionNavBadge() {
  const { data: auctions = [] } = useAuctions()
  // Rendered in a portal: the sidebar scrolls and the nav links are clipped (chamfer).
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const active = auctions.filter((a) => !isAuctionFinished(a.status))
  if (active.length === 0) return null

  return (
    <>
      <span
        className="auction-nav-badge"
        aria-label={`${active.length} leilão(ões) ativo(s)`}
        onMouseEnter={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}
        onMouseLeave={() => setAnchor(null)}
      >
        {active.length}
      </span>
      {anchor &&
        createPortal(
          <div
            className="auction-nav-popover"
            role="tooltip"
            style={{ top: anchor.top + anchor.height / 2, left: anchor.right + 14 }}
          >
            <span className="auction-nav-popover__title">Leilões ativos</span>
            <ul>
              {active.map((a) => (
                <PopoverRow key={a.id} auction={a} />
              ))}
            </ul>
          </div>,
          document.body,
        )}
    </>
  )
}
