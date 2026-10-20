import type { ReactNode } from 'react'
import { useGuildEmojiMap } from '@/Domain/Emoji/hooks/useGuildEmojis'
import { Emoji } from './Emoji'
import { EMOJI_TOKEN, guildEmojiName } from './twemoji'

/** As on Discord: a message made only of emojis (up to this many) shows them large. */
const JUMBO_MAX = 27

interface EmojiTextProps {
  text: string
  size?: number
  /** Emoji-only message: Unicode emojis. */
  jumboSize?: number
  /** Emoji-only message: guild emojis (uploaded at 128px, so they hold up larger). */
  guildJumboSize?: number
}

/** Message text with Unicode emojis and known `:name:` guild emojis drawn as images. */
export function EmojiText({ text, size = 22, jumboSize = 48, guildJumboSize = jumboSize }: EmojiTextProps) {
  const guildEmojis = useGuildEmojiMap()
  const parts: (string | { emoji: string })[] = []
  let last = 0
  for (const match of text.matchAll(EMOJI_TOKEN)) {
    const token = match[0]
    const name = guildEmojiName(token)
    if (name && !guildEmojis.has(name)) continue // unknown :name: stays text
    if (match.index > last) parts.push(text.slice(last, match.index))
    parts.push({ emoji: token })
    last = match.index + token.length
  }
  if (last < text.length) parts.push(text.slice(last))

  const emojiCount = parts.filter((p) => typeof p !== 'string').length
  const jumbo =
    emojiCount > 0 &&
    emojiCount <= JUMBO_MAX &&
    parts.every((p) => typeof p !== 'string' || p.trim() === '')

  const nodes: ReactNode[] = parts.map((p, i) =>
    typeof p === 'string' ? (
      p
    ) : (
      <Emoji
        key={i}
        emoji={p.emoji}
        size={!jumbo ? size : guildEmojiName(p.emoji) ? guildJumboSize : jumboSize}
        className="emoji--inline"
      />
    ),
  )
  return <>{nodes}</>
}
