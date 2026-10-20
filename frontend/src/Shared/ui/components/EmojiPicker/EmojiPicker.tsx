import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDeleteGuildEmoji, useGuildEmojis, type GuildEmoji } from '@/Domain/Emoji/hooks/useGuildEmojis'
import { useAuthContext } from '@/Features/Auth/contexts/AuthContext'
import { useAppToast } from '@/Shared/ui/components/AppToast/AppToast'
import { ConfirmDialog } from '@/Shared/ui/components/ConfirmDialog/ConfirmDialog'
import { Emoji } from '@/Shared/ui/components/Emoji/Emoji'
import { guildEmojiName } from '@/Shared/ui/components/Emoji/twemoji'
import {
  loadEmojiGroups,
  normalizeSearch,
  recordEmojiUse,
  useFrequentEmojis,
  type EmojiEntry,
  type EmojiGroup,
} from './emojiData'
import { GuildEmojiDialog } from './GuildEmojiDialog'
import './EmojiPicker.styles.scss'

const WIDTH = 408
const HEIGHT = 440
const MARGIN = 8
const FREQUENT = { key: 'frequent', label: 'Usados com frequência', icon: '🕘' }

interface EmojiPickerProps {
  /** Rect of the button that opened the picker; the picker sits next to it, inside the viewport. */
  anchor: DOMRect
  onSelect: (emoji: string) => void
  onClose: () => void
}

/**
 * Discord-style picker: search, category rail, frequently used, preview footer. Shift+click keeps it open.
 * Líder/Administrador also add guild emojis (header button) and delete them (footer, on hover).
 */
export function EmojiPicker({ anchor, onSelect, onClose }: EmojiPickerProps) {
  const [groups, setGroups] = useState<EmojiGroup[] | null>(null)
  const [query, setQuery] = useState('')
  const [hovered, setHovered] = useState<EmojiEntry | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const frequent = useFrequentEmojis(24)
  const { hasRole } = useAuthContext()
  const canManage = hasRole('ADMINISTRADOR') // Líder ranks above Administrador
  const deleteEmoji = useDeleteGuildEmoji()
  const { showToast } = useAppToast()
  /** Dialog opened over the picker: add a guild emoji, or confirm deleting one. */
  const [dialog, setDialog] = useState<'add' | GuildEmoji | null>(null)

  useEffect(() => {
    let alive = true
    loadEmojiGroups().then((g) => alive && setGroups(g))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    // While a dialog is open over the picker, Escape and clicks belong to the dialog.
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !dialog && onClose()
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element
      // The toggle button handles its own click (otherwise it would close and reopen the picker).
      if (rootRef.current?.contains(target) || target.closest('[data-emoji-picker-toggle], .modal-overlay')) return
      onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [onClose, dialog])

  const { data: guildEmojis = [] } = useGuildEmojis()

  // Guild emojis first, like a server's own emojis on Discord.
  const allGroups = useMemo(() => {
    if (!groups) return null
    if (guildEmojis.length === 0) return groups
    const guild: EmojiGroup = {
      key: 'guild',
      label: 'Emojis da guild',
      icon: `:${guildEmojis[0].name}:`,
      emojis: guildEmojis.map((e) => ({
        emoji: `:${e.name}:`,
        label: e.name,
        shortcode: e.name,
        search: normalizeSearch(e.name.replace(/_/g, ' ') + ' ' + e.name),
      })),
    }
    return [guild, ...groups]
  }, [groups, guildEmojis])

  const byEmoji = useMemo(
    () => new Map(allGroups?.flatMap((g) => g.emojis.map((e) => [e.emoji, e] as const)) ?? []),
    [allGroups],
  )

  const sections = useMemo(() => {
    if (!allGroups) return []
    const q = normalizeSearch(query.trim().replace(/:/g, ''))
    if (q) {
      const words = q.split(/\s+/)
      const results = allGroups.flatMap((g) => g.emojis).filter((e) => words.every((w) => e.search.includes(w)))
      return [{ key: 'search', label: 'Resultados', icon: '🔍', emojis: results }]
    }
    const frequentEntries = frequent
      .filter((emoji) => !guildEmojiName(emoji) || byEmoji.has(emoji)) // deleted guild emojis
      .map((emoji) => byEmoji.get(emoji) ?? { emoji, label: emoji, shortcode: emoji, search: '' })
    return [{ ...FREQUENT, emojis: frequentEntries }, ...allGroups]
  }, [allGroups, query, frequent, byEmoji])

  // Above the anchor when there is room, else below; right edges aligned, clamped to the viewport.
  const position = useMemo(() => {
    const above = anchor.top - HEIGHT - MARGIN
    const top = above >= MARGIN ? above : Math.min(anchor.bottom + MARGIN, window.innerHeight - HEIGHT - MARGIN)
    const left = Math.min(Math.max(anchor.right - WIDTH, MARGIN), window.innerWidth - WIDTH - MARGIN)
    return { top: Math.max(top, MARGIN), left: Math.max(left, MARGIN) }
  }, [anchor])

  useLayoutEffect(() => {
    gridRef.current?.scrollTo({ top: 0 })
  }, [query])

  const jumpTo = (key: string, from: HTMLElement) => {
    setQuery('')
    const picker = from.closest('.emoji-picker')
    requestAnimationFrame(() =>
      picker?.querySelector<HTMLElement>(`[data-section="${key}"]`)?.scrollIntoView({ block: 'start' }),
    )
  }

  const pick = (entry: EmojiEntry, keepOpen: boolean) => {
    recordEmojiUse(entry.emoji)
    onSelect(entry.emoji)
    if (!keepOpen) onClose()
  }

  const firstResult = sections[0]?.emojis[0]
  const preview = hovered ?? firstResult ?? null
  const previewGuildEmoji = preview
    ? guildEmojis.find((e) => `:${e.name}:` === preview.emoji)
    : undefined

  const handleDelete = async (emoji: GuildEmoji) => {
    try {
      await deleteEmoji.mutateAsync(emoji.id)
      showToast(`Emoji :${emoji.name}: excluído.`, 'success')
      setHovered(null)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Não foi possível excluir o emoji.', 'error')
    } finally {
      setDialog(null)
    }
  }

  return createPortal(
    <div
      ref={rootRef}
      className="emoji-picker"
      style={{ ...position, width: WIDTH, height: HEIGHT }}
      role="dialog"
      aria-label="Escolher emoji"
    >
      <div className="emoji-picker__header">
        <input
          autoFocus
          className="emoji-picker__search"
          placeholder={preview ? `:${preview.shortcode}:` : 'Buscar emoji'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && query && firstResult) pick(firstResult, e.shiftKey)
          }}
        />
        {canManage && (
          <button type="button" className="emoji-picker__add" onClick={() => setDialog('add')}>
            Adicionar emoji
          </button>
        )}
      </div>

      <div className="emoji-picker__body">
        <nav className="emoji-picker__rail">
          {allGroups &&
            [FREQUENT, ...allGroups].map((g) => (
              <button key={g.key} type="button" title={g.label} onClick={(e) => jumpTo(g.key, e.currentTarget)}>
                <Emoji emoji={g.icon} size={22} />
              </button>
            ))}
        </nav>

        <div className="emoji-picker__grid" ref={gridRef}>
          {!groups && <p className="emoji-picker__empty">Carregando…</p>}
          {groups && !firstResult && <p className="emoji-picker__empty">Nenhum emoji encontrado.</p>}
          {sections.map(
            (section) =>
              section.emojis.length > 0 && (
                <section key={section.key} data-section={section.key}>
                  <h4 className="emoji-picker__section-title">{section.label}</h4>
                  <div className="emoji-picker__cells">
                    {section.emojis.map((entry) => (
                      <button
                        key={entry.emoji}
                        type="button"
                        className="emoji-picker__cell"
                        aria-label={entry.label}
                        onMouseEnter={() => setHovered(entry)}
                        onClick={(e) => pick(entry, e.shiftKey)}
                      >
                        <Emoji emoji={entry.emoji} size={32} />
                      </button>
                    ))}
                  </div>
                </section>
              ),
          )}
        </div>
      </div>

      <div className="emoji-picker__footer">
        {preview && (
          <>
            <Emoji key={preview.emoji} emoji={preview.emoji} size={28} />
            <span className="emoji-picker__footer-code">:{preview.shortcode}:</span>
            {!previewGuildEmoji && <span className="emoji-picker__footer-label">{preview.label}</span>}
            {canManage && previewGuildEmoji && (
              <button
                type="button"
                className="emoji-picker__delete"
                onClick={() => setDialog(previewGuildEmoji)}
              >
                Excluir
              </button>
            )}
          </>
        )}
      </div>

      {dialog === 'add' && <GuildEmojiDialog onClose={() => setDialog(null)} />}
      {dialog && dialog !== 'add' && (
        <ConfirmDialog
          open
          title={`Excluir :${dialog.name}:`}
          code="ADM"
          confirmLabel="Excluir emoji"
          loading={deleteEmoji.isPending}
          onConfirm={() => handleDelete(dialog)}
          onCancel={() => setDialog(null)}
        >
          <p>As reações com este emoji serão removidas. Nas mensagens, ele volta a aparecer como texto.</p>
        </ConfirmDialog>
      )}
    </div>,
    document.body,
  )
}
