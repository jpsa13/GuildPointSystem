import { useState } from 'react'
import type { AuctionItem } from '@/Domain/types/models'
import { SpriteIcon } from '@/Shared/ui/components/SpriteIcon/SpriteIcon'
import { mediaUrl } from '@/Shared/utils/mediaUrl'
import './AuctionItemIcon.styles.scss'

/** Item icon for auction surfaces: game sprite → uploaded image → initial letter. */
export function AuctionItemIcon({ item, size = 40 }: { item: AuctionItem | undefined; size?: number }) {
  const [imgError, setImgError] = useState(false)

  return (
    <span className="auction-item-icon" style={{ width: size + 6, height: size + 6 }}>
      {item?.gameIcon ? (
        <SpriteIcon
          iconId={item.gameIcon.iconId}
          spriteSheet={item.gameIcon.spriteSheet}
          spriteCols={item.gameIcon.spriteCols}
          size={size}
        />
      ) : item?.imageUrl && !imgError ? (
        <img
          src={mediaUrl(item.imageUrl)}
          alt=""
          width={size}
          height={size}
          className="auction-item-icon__img"
          onError={() => setImgError(true)}
        />
      ) : (
        <span className="auction-item-icon__fallback">{item?.itemName?.[0] ?? '?'}</span>
      )}
    </span>
  )
}
