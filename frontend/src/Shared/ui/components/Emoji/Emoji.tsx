import { useState } from 'react'
import { useGuildEmojiMap } from '@/Domain/Emoji/hooks/useGuildEmojis'
import { mediaUrl } from '@/Shared/utils/mediaUrl'
import { guildEmojiName, twemojiUrl } from './twemoji'
import './Emoji.styles.scss'

interface EmojiProps {
  /** A Unicode emoji, or a guild emoji as `:name:`. */
  emoji: string
  size?: number
  className?: string
}

/**
 * Unicode emojis use Twemoji, falling back to the system font when it has no image.
 * Guild emojis use their uploaded image; a deleted one shows as `:name:` text.
 */
export function Emoji({ emoji, size = 20, className = '' }: EmojiProps) {
  const [failed, setFailed] = useState(false)
  const guildEmojis = useGuildEmojiMap()
  const name = guildEmojiName(emoji)
  const guild = name ? guildEmojis.get(name) : undefined

  if (failed || (name && !guild)) {
    return (
      <span
        className={`emoji emoji--text ${className}`.trim()}
        style={name ? undefined : { fontSize: size * 0.9, width: size, height: size }}
      >
        {emoji}
      </span>
    )
  }
  return (
    <img
      className={`emoji ${className}`.trim()}
      src={guild ? mediaUrl(guild.imageUrl) : twemojiUrl(emoji)}
      alt={emoji}
      title={guild ? emoji : undefined}
      width={size}
      height={size}
      loading="lazy"
      draggable={false}
      onError={() => setFailed(true)}
    />
  )
}
