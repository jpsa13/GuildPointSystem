import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Button } from '@/Shared/ui/components/Button/Button'
import '@/Features/Auth/Auth.styles.scss'

interface NewsEditorModalProps {
  mode: 'create' | 'edit'
  initialTitle?: string
  initialHtml?: string
  loading: boolean
  onClose: () => void
  onSubmit: (payload: { title: string; contentHtml: string }) => void
}

function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={`news-editor__tool${active ? ' news-editor__tool--active' : ''}`}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // Keep the editor's selection when clicking a toolbar button.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function Toolbar({ editor }: { editor: Editor }) {
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')

  // TipTap v3 doesn't re-render on every transaction; subscribe to the bits the toolbar shows.
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      link: e.isActive('link'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  })

  const chain = () => editor.chain().focus()

  const openLink = () => {
    setLinkUrl(editor.getAttributes('link').href ?? '')
    setLinkOpen(true)
  }
  const applyLink = () => {
    const url = linkUrl.trim()
    if (!url) chain().extendMarkRange('link').unsetLink().run()
    else chain().extendMarkRange('link').setLink({ href: /^(https?:|mailto:)/i.test(url) ? url : `https://${url}` }).run()
    setLinkOpen(false)
  }

  return (
    <div className="news-editor__toolbar" role="toolbar" aria-label="Formatação">
      <ToolbarButton label="Negrito (Ctrl+B)" active={state.bold} onClick={() => chain().toggleBold().run()}>
        <strong>B</strong>
      </ToolbarButton>
      <ToolbarButton label="Itálico (Ctrl+I)" active={state.italic} onClick={() => chain().toggleItalic().run()}>
        <em>I</em>
      </ToolbarButton>
      <ToolbarButton label="Sublinhado (Ctrl+U)" active={state.underline} onClick={() => chain().toggleUnderline().run()}>
        <u>U</u>
      </ToolbarButton>
      <ToolbarButton label="Riscado" active={state.strike} onClick={() => chain().toggleStrike().run()}>
        <s>S</s>
      </ToolbarButton>
      <span className="news-editor__sep" />
      <ToolbarButton label="Título" active={state.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}>
        H2
      </ToolbarButton>
      <ToolbarButton label="Subtítulo" active={state.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}>
        H3
      </ToolbarButton>
      <span className="news-editor__sep" />
      <ToolbarButton label="Lista" active={state.bullet} onClick={() => chain().toggleBulletList().run()}>
        • ―
      </ToolbarButton>
      <ToolbarButton label="Lista numerada" active={state.ordered} onClick={() => chain().toggleOrderedList().run()}>
        1. ―
      </ToolbarButton>
      <ToolbarButton label="Citação" active={state.quote} onClick={() => chain().toggleBlockquote().run()}>
        ❝
      </ToolbarButton>
      <ToolbarButton label="Linha divisória" onClick={() => chain().setHorizontalRule().run()}>
        ―
      </ToolbarButton>
      <ToolbarButton label="Link" active={state.link} onClick={openLink}>
        🔗
      </ToolbarButton>
      <span className="news-editor__sep" />
      <ToolbarButton label="Desfazer (Ctrl+Z)" disabled={!state.canUndo} onClick={() => chain().undo().run()}>
        ↶
      </ToolbarButton>
      <ToolbarButton label="Refazer (Ctrl+Shift+Z)" disabled={!state.canRedo} onClick={() => chain().redo().run()}>
        ↷
      </ToolbarButton>

      {linkOpen && (
        <div className="news-editor__link">
          <input
            autoFocus
            value={linkUrl}
            placeholder="https://… (vazio remove o link)"
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                applyLink()
              }
              if (e.key === 'Escape') setLinkOpen(false)
            }}
          />
          <Button size="sm" onClick={applyLink}>
            OK
          </Button>
        </div>
      )}
    </div>
  )
}

export function NewsEditorModal({
  mode,
  initialTitle = '',
  initialHtml = '',
  loading,
  onClose,
  onSubmit,
}: NewsEditorModalProps) {
  const [title, setTitle] = useState(initialTitle)
  const [isEmpty, setIsEmpty] = useState(!initialHtml)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
      }),
    ],
    content: initialHtml,
    onUpdate: ({ editor: e }) => setIsEmpty(e.isEmpty),
    editorProps: { attributes: { class: 'news-content news-editor__surface' } },
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [loading, onClose])

  const canSubmit = title.trim().length > 0 && !isEmpty && !loading

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editor || !canSubmit) return
    onSubmit({ title: title.trim(), contentHtml: editor.getHTML() })
  }

  return createPortal(
    <div className="modal-overlay" role="presentation">
      <form
        className="modal-card news-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="news-editor-title"
        onSubmit={submit}
      >
        <div className="auth-window-bar">
          <span id="news-editor-title">{mode === 'create' ? 'Nova notícia' : 'Editar notícia'}</span>
          <span className="auth-window-bar__code">NEWS</span>
        </div>
        <div className="auth-card-content news-editor__body">
          <label className="news-editor__field">
            <span>Título</span>
            <input
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Guerra de guild neste sábado"
              autoFocus
              required
            />
          </label>
          <div className="news-editor__field">
            <span>Conteúdo</span>
            <div className="news-editor__frame">
              {editor && <Toolbar editor={editor} />}
              <EditorContent editor={editor} />
            </div>
          </div>
          <div className="news-editor__actions">
            <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" loading={loading} disabled={!canSubmit}>
              {mode === 'create' ? 'Publicar' : 'Salvar alterações'}
            </Button>
          </div>
        </div>
      </form>
    </div>,
    document.body,
  )
}
