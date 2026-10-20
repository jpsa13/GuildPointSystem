/** Twemoji (the artwork Discord uses), so emojis look the same on every OS — flags included. */
const TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@16.0.1/assets/svg/'

/** Twemoji file name: code points in hex; FE0F is dropped unless the sequence has a ZWJ. */
export function twemojiUrl(emoji: string) {
  const sequence = emoji.includes('‍') ? emoji : emoji.replace(/️/g, '')
  return `${TWEMOJI_BASE}${[...sequence].map((c) => c.codePointAt(0)!.toString(16)).join('-')}.svg`
}

const GUILD_EMOJI = /^:([A-Za-z0-9_]{2,32}):$/

/** `"dude"` for a guild emoji key `":dude:"`; null for Unicode emojis. */
export function guildEmojiName(emoji: string) {
  return GUILD_EMOJI.exec(emoji)?.[1] ?? null
}

/**
 * One Unicode emoji (flags, keycaps, skin tones and ZWJ sequences included) or a `:name:` token.
 * Used to turn message text into text + emoji parts.
 */
export const EMOJI_TOKEN =
  /:[A-Za-z0-9_]{2,32}:|\p{RI}\p{RI}|[#*0-9]️?⃣|\p{Extended_Pictographic}(?:️|\p{EMod})?(?:‍\p{Extended_Pictographic}(?:️|\p{EMod})?)*/gu
