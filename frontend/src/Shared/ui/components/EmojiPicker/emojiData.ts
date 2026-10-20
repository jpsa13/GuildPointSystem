import { useSyncExternalStore } from 'react'

export interface EmojiEntry {
  emoji: string
  label: string
  /** Discord-style name, without colons (e.g. "rolling_on_the_floor_laughing"). */
  shortcode: string
  /** Normalized label, tags and shortcodes for search. */
  search: string
}

export interface EmojiGroup {
  key: string
  label: string
  /** Shown on the category rail. */
  icon: string
  emojis: EmojiEntry[]
}

/** emojibase group order → our labels; group 2 (skin tone components) is left out. */
const GROUPS: Record<number, { key: string; label: string; icon: string }> = {
  0: { key: 'smileys', label: 'Carinhas e emoções', icon: '😀' },
  1: { key: 'people', label: 'Pessoas', icon: '🧑' },
  3: { key: 'nature', label: 'Natureza', icon: '🐻' },
  4: { key: 'food', label: 'Comida e bebida', icon: '🍔' },
  5: { key: 'travel', label: 'Viagens e lugares', icon: '✈️' },
  6: { key: 'activities', label: 'Atividades', icon: '⚽' },
  7: { key: 'objects', label: 'Objetos', icon: '💡' },
  8: { key: 'symbols', label: 'Símbolos', icon: '💕' },
  9: { key: 'flags', label: 'Bandeiras', icon: '🏁' },
}

export function normalizeSearch(text: string) {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

let groupsPromise: Promise<EmojiGroup[]> | null = null

/** Loaded on first use: the dataset (~600 KB) is its own chunk, fetched only when a picker opens. */
export function loadEmojiGroups(): Promise<EmojiGroup[]> {
  groupsPromise ??= Promise.all([
    import('emojibase-data/pt/compact.json'),
    import('emojibase-data/en/shortcodes/iamcal.json'),
  ]).then(([{ default: data }, { default: shortcodes }]) => {
    const byGroup = new Map<number, EmojiEntry[]>()
    for (const e of [...data].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
      if (e.group == null || !GROUPS[e.group]) continue
      const codes = shortcodes[e.hexcode as keyof typeof shortcodes] as string | string[] | undefined
      const names = codes == null ? [] : Array.isArray(codes) ? codes : [codes]
      const entry: EmojiEntry = {
        emoji: e.unicode,
        label: e.label,
        shortcode: names[0] ?? normalizeSearch(e.label).replace(/\W+/g, '_'),
        search: normalizeSearch([e.label, ...(e.tags ?? []), ...names].join(' ')),
      }
      byGroup.set(e.group, [...(byGroup.get(e.group) ?? []), entry])
    }
    return Object.entries(GROUPS)
      .map(([group, meta]) => ({ ...meta, emojis: byGroup.get(Number(group)) ?? [] }))
      .filter((g) => g.emojis.length > 0)
  })
  return groupsPromise
}

// ─── Frequently used (per viewer, browser storage) ───────────────────────────

const FREQUENT_KEY = 'emoji-frequent'
const DEFAULT_FREQUENT = ['👍', '😂', '🔥', '❤️', '✅', '👀']
const listeners = new Set<() => void>()
let frequentCache: string[] | null = null

function readCounts(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(FREQUENT_KEY) ?? '{}') as Record<string, number>
  } catch {
    return {}
  }
}

function computeFrequent() {
  const counts = readCounts()
  const used = Object.keys(counts).sort((a, b) => counts[b] - counts[a])
  return [...used, ...DEFAULT_FREQUENT.filter((e) => !used.includes(e))]
}

export function recordEmojiUse(emoji: string) {
  const counts = readCounts()
  counts[emoji] = (counts[emoji] ?? 0) + 1
  try {
    localStorage.setItem(FREQUENT_KEY, JSON.stringify(counts))
  } catch {
    // Storage blocked: frequent list just stays at the defaults.
  }
  frequentCache = null
  listeners.forEach((listener) => listener())
}

/** Most used emojis first, padded with defaults. */
export function useFrequentEmojis(limit: number) {
  const all = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => (frequentCache ??= computeFrequent()),
  )
  return all.slice(0, limit)
}
