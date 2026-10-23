import { Link } from 'react-router-dom'
import { useDiscordBySiteMember } from '@/Domain/Discord/hooks/useDiscordMembers'
import { useAuctionViewers } from '@/Domain/Presence/hooks/useAuctionViewers'
import { MemberClassIcon } from '@/Shared/ui/components/MemberClassIcon/MemberClassIcon'
import { Panel } from '@/Shared/ui/components/Panel/Panel'
import './AuctionViewers.styles.scss'

/** Who has this auction open right now (Discord avatar when the account is linked, else the class icon). */
export function AuctionViewers({ auctionId }: { auctionId: number }) {
  const { data: viewers = [] } = useAuctionViewers(auctionId)
  const discordBySite = useDiscordBySiteMember()

  return (
    <Panel title="Neste leilão" code={`${viewers.length} ON`} className="auction-viewers" flush>
      {viewers.length === 0 ? (
        <p className="auction-viewers__empty">Ninguém por aqui.</p>
      ) : (
        <ul className="auction-viewers__list">
          {viewers.map((viewer) => {
            const discord = discordBySite.get(viewer.memberId)
            return (
              <li
                key={viewer.memberId}
                className={`auction-viewers__item${viewer.idle ? ' auction-viewers__item--idle' : ''}`}
                title={viewer.idle ? 'Com a aba em segundo plano' : undefined}
              >
                <Link to={`/profile/${viewer.memberId}`} className="auction-viewers__link">
                  <span className="auction-viewers__avatar">
                    {discord?.avatarUrl ? (
                      <img src={discord.avatarUrl} alt="" loading="lazy" />
                    ) : (
                      <MemberClassIcon classImageUrl={viewer.classImageUrl} classLabel={viewer.className} size="sm" />
                    )}
                    <span className="auction-viewers__dot" />
                  </span>
                  <span className="auction-viewers__text">
                    <span className="auction-viewers__name">{viewer.nickname}</span>
                    {discord && (
                      <span
                        className="auction-viewers__discord"
                        style={discord.color ? { color: discord.color } : undefined}
                      >
                        {discord.name}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
