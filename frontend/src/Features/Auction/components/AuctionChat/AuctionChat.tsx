import { memo, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  useAuctionMessages,
  useSendAuctionMessage,
  useToggleReaction,
} from '@/Domain/Auction/hooks/useAuction'
import { useDiscordBySiteMember, type DiscordMember } from '@/Domain/Discord/hooks/useDiscordMembers'
import { useCurrentMember } from '@/Domain/Member/hooks/useMembers'
import type { AuctionMessage, AuctionMessageReaction } from '@/Domain/types/models'
import { useAppToast } from '@/Shared/ui/components/AppToast/AppToast'
import { useGuildEmojiMap } from '@/Domain/Emoji/hooks/useGuildEmojis'
import { Emoji } from '@/Shared/ui/components/Emoji/Emoji'
import { EmojiText } from '@/Shared/ui/components/Emoji/EmojiText'
import { guildEmojiName } from '@/Shared/ui/components/Emoji/twemoji'
import { EmojiPicker } from '@/Shared/ui/components/EmojiPicker/EmojiPicker'
import { useFrequentEmojis } from '@/Shared/ui/components/EmojiPicker/emojiData'
import { Panel } from '@/Shared/ui/components/Panel/Panel'
import './AuctionChat.styles.scss'

/** Consecutive messages from the same member within this window share one header, as on Discord. */
const GROUP_WINDOW_MS = 5 * 60_000
const AVATAR_COLORS = ['#5865f2', '#3ba55c', '#faa61a', '#ed4245', '#eb459e', '#3fe3d6']

type Me = { id: number; nickname: string }

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const dayOf = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })

/** Discord avatar for linked accounts; otherwise a colored circle with the initial. */
function Avatar({ id, nickname, discord, size }: { id: number; nickname: string; discord?: DiscordMember; size: number }) {
  if (discord?.avatarUrl) {
    return <img className="chat-avatar" src={discord.avatarUrl} alt="" width={size} height={size} loading="lazy" />
  }
  return (
    <span
      className="chat-avatar chat-avatar--initial"
      style={{ width: size, height: size, fontSize: size * 0.45, background: AVATAR_COLORS[id % AVATAR_COLORS.length] }}
      aria-hidden="true"
    >
      {nickname.charAt(0).toUpperCase()}
    </span>
  )
}

/** Site nickname, plus the Discord name in the member's role color when the account is linked. */
function SenderName({ id, nickname, discord }: { id: number; nickname: string; discord?: DiscordMember }) {
  return (
    <Link to={`/profile/${id}`} className="chat-msg__name">
      {nickname}
      {discord && (
        <span className="chat-msg__discord" style={discord.color ? { color: discord.color } : undefined}>
          {discord.name}
        </span>
      )}
    </Link>
  )
}

function ReactionPill({
  reaction,
  me,
  disabled,
  onToggle,
}: {
  reaction: AuctionMessageReaction
  me?: Me
  disabled: boolean
  onToggle: () => void
}) {
  const mine = !!me && reaction.members.some((m) => m.id === me.id)
  const names = reaction.members.map((m) => m.nickname).join(', ')
  return (
    <button
      type="button"
      className={`chat-reaction${mine ? ' chat-reaction--mine' : ''}`}
      title={`${names} ${reaction.members.length > 1 ? 'reagiram' : 'reagiu'}`}
      disabled={disabled}
      onClick={onToggle}
    >
      <Emoji emoji={reaction.emoji} size={16} />
      <span>{reaction.members.length}</span>
    </button>
  )
}

const ReplyIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path fill="currentColor" d="M10 8.26V4L3 11l7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-10.74Z" />
  </svg>
)

const AddReactionIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path
      fill="currentColor"
      d="M12 2a10 10 0 1 0 10 10h-2a8 8 0 1 1-8-8V2Zm-3.5 8a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm7 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM12 17.5a5.5 5.5 0 0 0 5.2-3.5H6.8a5.5 5.5 0 0 0 5.2 3.5ZM19 1v3h3v2h-3v3h-2V6h-3V4h3V1h2Z"
    />
  </svg>
)

interface AuctionChatProps {
  auctionId: number
  /** Finished auctions keep the history but take no messages or reactions. */
  closed: boolean
}

/**
 * Memoized: the auction page re-renders every second for its countdown, and the chat (emoji parsing,
 * avatars, reactions) only needs to redraw when its own messages, reactions or props change.
 */
export const AuctionChat = memo(function AuctionChat({ auctionId, closed }: AuctionChatProps) {
  const { data: messages = [] } = useAuctionMessages(auctionId)
  const { data: member } = useCurrentMember()
  const me: Me | undefined = member ? { id: member.id, nickname: member.nickname } : undefined
  const sendMessage = useSendAuctionMessage()
  const toggleReaction = useToggleReaction(auctionId, me)
  const discordBySite = useDiscordBySiteMember()
  const guildEmojis = useGuildEmojiMap()
  const quickReactions = useFrequentEmojis(10)
    .filter((emoji) => {
      const name = guildEmojiName(emoji)
      return !name || guildEmojis.has(name) // skip deleted guild emojis
    })
    .slice(0, 3)
  const { showToast } = useAppToast()

  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<AuctionMessage | null>(null)
  /** messageId null = the composer's picker (inserts into the text instead of reacting). */
  const [picker, setPicker] = useState<{ messageId: number | null; anchor: DOMRect } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  // Only a new message scrolls to the bottom — reactions also change the list.
  const lastId = messages.at(-1)?.id
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lastId])

  const react = (messageId: number, emoji: string) => {
    toggleReaction.mutate(
      { messageId, emoji },
      { onError: (err) => showToast(err instanceof Error ? err.message : 'Não foi possível reagir.', 'error') },
    )
  }

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim() || sendMessage.isPending) return
    try {
      await sendMessage.mutateAsync({ id: auctionId, content: text, replyToId: replyTo?.id })
      setText('')
      setReplyTo(null)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Não foi possível enviar a mensagem.', 'error')
    }
  }

  const startReply = (msg: AuctionMessage) => {
    setReplyTo(msg)
    inputRef.current?.focus()
  }

  /** Scrolls to a quoted message and flashes it. */
  const jumpTo = (id: number) => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-msg-id="${id}"]`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.remove('chat-msg--flash')
    void el.offsetWidth // restart the animation on repeated clicks
    el.classList.add('chat-msg--flash')
  }

  /** Inserts at the cursor; Unicode emojis go in as characters, guild emojis as `:name:`. */
  const insertEmoji = (emoji: string) => {
    const input = inputRef.current
    const start = input?.selectionStart ?? text.length
    const end = input?.selectionEnd ?? text.length
    const piece = guildEmojiName(emoji) ? `${emoji} ` : emoji
    setText(text.slice(0, start) + piece + text.slice(end))
    requestAnimationFrame(() => {
      input?.focus()
      input?.setSelectionRange(start + piece.length, start + piece.length)
    })
  }

  const openPicker = (messageId: number | null, button: HTMLElement) =>
    setPicker((current) =>
      current?.messageId === messageId ? null : { messageId, anchor: button.getBoundingClientRect() },
    )

  return (
    <Panel title="Canal do leilão" code="COM" className="auction-chat" flush>
      <div className="chat-list" ref={listRef}>
        {messages.length === 0 && <p className="chat-list__empty">Nenhuma mensagem ainda.</p>}

        {messages.map((msg, index) => {
          const prev = messages[index - 1]
          const newDay = !prev || dayOf(prev.createdAt) !== dayOf(msg.createdAt)
          const isSystem = msg.type !== 'TEXT'
          const sender = msg.member
          const grouped =
            !newDay &&
            !isSystem &&
            !msg.replyTo &&
            prev?.type === 'TEXT' &&
            !!sender &&
            prev.member?.id === sender.id &&
            new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime() < GROUP_WINDOW_MS
          const mentionsMe = !!me && msg.replyTo?.member?.id === me.id && sender?.id !== me.id
          const reactions = msg.reactions ?? []
          const pickerOpen = picker?.messageId === msg.id

          return (
            <div key={msg.id}>
              {newDay && (
                <div className="chat-list__day">
                  <span>{dayOf(msg.createdAt)}</span>
                </div>
              )}
              <div
                data-msg-id={msg.id}
                className={[
                  'chat-msg',
                  grouped ? 'chat-msg--grouped' : '',
                  isSystem ? `chat-msg--system chat-msg--${msg.type.toLowerCase()}` : '',
                  mentionsMe ? 'chat-msg--mention' : '',
                  pickerOpen ? 'chat-msg--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {msg.replyTo && (
                  <button type="button" className="chat-msg__reply-ref" onClick={() => jumpTo(msg.replyTo!.id)}>
                    {msg.replyTo.member && (
                      <Avatar
                        id={msg.replyTo.member.id}
                        nickname={msg.replyTo.member.nickname}
                        discord={discordBySite.get(msg.replyTo.member.id)}
                        size={18}
                      />
                    )}
                    <strong>@{msg.replyTo.member?.nickname ?? 'desconhecido'}</strong>
                    <span>
                      <EmojiText text={msg.replyTo.content} size={16} jumboSize={16} />
                    </span>
                  </button>
                )}

                <div className="chat-msg__gutter">
                  {isSystem ? (
                    <Emoji emoji={msg.type === 'BID' ? '💰' : '📢'} size={20} />
                  ) : grouped ? (
                    <span className="chat-msg__hover-time">{timeOf(msg.createdAt)}</span>
                  ) : (
                    sender && (
                      <Avatar id={sender.id} nickname={sender.nickname} discord={discordBySite.get(sender.id)} size={40} />
                    )
                  )}
                </div>

                <div className="chat-msg__body">
                  {!grouped && !isSystem && sender && (
                    <div className="chat-msg__header">
                      <SenderName id={sender.id} nickname={sender.nickname} discord={discordBySite.get(sender.id)} />
                      <time className="chat-msg__time">{timeOf(msg.createdAt)}</time>
                    </div>
                  )}
                  <div className="chat-msg__content">
                    {isSystem ? msg.content : <EmojiText text={msg.content} guildJumboSize={96} />}
                    {isSystem && <time className="chat-msg__time">{timeOf(msg.createdAt)}</time>}
                  </div>

                  {reactions.length > 0 && (
                    <div className="chat-msg__reactions">
                      {reactions.map((r) => (
                        <ReactionPill
                          key={r.emoji}
                          reaction={r}
                          me={me}
                          disabled={closed}
                          onToggle={() => react(msg.id, r.emoji)}
                        />
                      ))}
                      {!closed && (
                        <button
                          type="button"
                          className="chat-reaction chat-reaction--add"
                          title="Adicionar reação"
                          data-emoji-picker-toggle
                          onClick={(e) => openPicker(msg.id, e.currentTarget)}
                        >
                          <AddReactionIcon />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {!closed && (
                  <div className="chat-msg__toolbar">
                    {quickReactions.map((emoji) => (
                      <button key={emoji} type="button" title={`Reagir com ${emoji}`} onClick={() => react(msg.id, emoji)}>
                        <Emoji emoji={emoji} size={20} />
                      </button>
                    ))}
                    <span className="chat-msg__toolbar-sep" />
                    <button
                      type="button"
                      title="Adicionar reação"
                      data-emoji-picker-toggle
                      onClick={(e) => openPicker(msg.id, e.currentTarget)}
                    >
                      <AddReactionIcon />
                    </button>
                    {!isSystem && (
                      <button type="button" title="Responder" onClick={() => startReply(msg)}>
                        <ReplyIcon />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="chat-composer">
        {replyTo && !closed && (
          <div className="chat-composer__replying">
            <span>
              Respondendo a <strong>{replyTo.member?.nickname}</strong>
            </span>
            <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancelar resposta">
              ×
            </button>
          </div>
        )}
        <div className="chat-composer__field">
          <input
            ref={inputRef}
            className="chat-composer__input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setReplyTo(null)}
            placeholder={closed ? 'Leilão encerrado' : 'Conversar no leilão'}
            disabled={closed}
          />
          {!closed && (
            <button
              type="button"
              className="chat-composer__emoji"
              title="Escolher emoji"
              data-emoji-picker-toggle
              onClick={(e) => openPicker(null, e.currentTarget)}
            >
              <AddReactionIcon />
            </button>
          )}
        </div>
      </form>

      {picker && (
        <EmojiPicker
          anchor={picker.anchor}
          onSelect={(emoji) => (picker.messageId == null ? insertEmoji(emoji) : react(picker.messageId, emoji))}
          onClose={() => setPicker(null)}
        />
      )}
    </Panel>
  )
})
