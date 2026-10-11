import { lazy, Suspense, useCallback, useState } from 'react'
import { useCreateNews, useDeleteNews, useNewsPage, useUpdateNews } from '@/Domain/News/hooks/useNews'
import type { News } from '@/Domain/types/models'
import { useAuthContext } from '@/Features/Auth/contexts/AuthContext'
import { NewsContent } from '@/Features/News/components/NewsContent'
// The rich-text editor (TipTap/ProseMirror) is heavy and only leadership uses it: load on demand.
const NewsEditorModal = lazy(() =>
  import('@/Features/News/components/NewsEditorModal').then((m) => ({ default: m.NewsEditorModal })),
)
import { useAppToast } from '@/Shared/ui/components/AppToast/AppToast'
import { Button } from '@/Shared/ui/components/Button/Button'
import { ConfirmDialog } from '@/Shared/ui/components/ConfirmDialog/ConfirmDialog'
import { Panel } from '@/Shared/ui/components/Panel/Panel'
import './News.styles.scss'

const formatStamp = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

/** Dashboard news: one per page, newest first. Líder/Administrador can publish, edit and delete. */
export function NewsPanel({ className = '' }: { className?: string }) {
  const { hasRole } = useAuthContext()
  const canManage = hasRole('ADMINISTRADOR') // Líder ranks above Administrador
  const { showToast } = useAppToast()

  const [page, setPage] = useState(0)
  const { data, isLoading } = useNewsPage(page)
  const total = data?.totalElements ?? 0
  // A deletion can leave us past the last page — fall back to the last existing one.
  if (data && page > 0 && page >= Math.max(1, data.totalPages)) setPage(Math.max(0, data.totalPages - 1))
  const news = data?.content[0]

  const [editor, setEditor] = useState<{ mode: 'create' } | { mode: 'edit'; news: News } | null>(null)
  const [toDelete, setToDelete] = useState<News | null>(null)
  const closeEditor = useCallback(() => setEditor(null), [])
  const closeDelete = useCallback(() => setToDelete(null), [])

  const createNews = useCreateNews()
  const updateNews = useUpdateNews()
  const deleteNews = useDeleteNews()

  const fail = (err: unknown) =>
    showToast(err instanceof Error ? err.message : 'Não foi possível concluir a ação.', 'error')

  const handleSubmit = (payload: { title: string; contentHtml: string }) => {
    if (!editor) return
    if (editor.mode === 'create') {
      createNews.mutate(payload, {
        onSuccess: () => {
          setPage(0) // the new one is the most recent
          setEditor(null)
          showToast('Notícia publicada.', 'success')
        },
        onError: fail,
      })
    } else {
      updateNews.mutate(
        { id: editor.news.id, ...payload },
        {
          onSuccess: () => {
            setEditor(null)
            showToast('Notícia atualizada.', 'success')
          },
          onError: fail,
        },
      )
    }
  }

  const handleDelete = () => {
    if (!toDelete) return
    deleteNews.mutate(toDelete.id, {
      onSuccess: () => {
        setToDelete(null)
        showToast('Notícia excluída.', 'success')
      },
      onError: (err) => {
        setToDelete(null)
        fail(err)
      },
    })
  }

  return (
    <Panel
      title="Notícias"
      code={`${total} NWS`}
      className={`news-panel ${className}`.trim()}
      actions={
        canManage ? (
          <Button size="sm" onClick={() => setEditor({ mode: 'create' })}>
            + Nova
          </Button>
        ) : undefined
      }
    >
      {isLoading && !data ? (
        <p className="dashboard__empty">Carregando notícias...</p>
      ) : !news ? (
        <p className="dashboard__empty">Nenhuma notícia publicada.</p>
      ) : (
        <article className="news-panel__article">
          <header className="news-panel__head">
            <h3 className="news-panel__title">{news.title}</h3>
            <p className="news-panel__meta">
              Publicada em {formatStamp(news.createdAt)}
              {news.authorNickname && ` por ${news.authorNickname}`}
              {news.updatedAt && (
                <>
                  <br />
                  Editada em {formatStamp(news.updatedAt)}
                  {news.editorNickname && ` por ${news.editorNickname}`}
                </>
              )}
            </p>
            {canManage && (
              <div className="news-panel__actions">
                <Button size="sm" variant="secondary" onClick={() => setEditor({ mode: 'edit', news })}>
                  Editar
                </Button>
                <Button size="sm" variant="danger" onClick={() => setToDelete(news)}>
                  Excluir
                </Button>
              </div>
            )}
          </header>
          <div className="news-panel__body">
            <NewsContent html={news.contentHtml} />
          </div>
        </article>
      )}

      {total > 1 && (
        <div className="dash-pagination news-panel__pagination">
          <button
            className="dash-pagination__btn"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            title="Mais recente"
          >
            ‹
          </button>
          <span className="dash-pagination__info">
            {page + 1} <span className="dash-pagination__sep">/</span> {total}
          </span>
          <button
            className="dash-pagination__btn"
            onClick={() => setPage((p) => Math.min(total - 1, p + 1))}
            disabled={page >= total - 1}
            title="Mais antiga"
          >
            ›
          </button>
        </div>
      )}

      {editor && (
        <Suspense fallback={null}>
          <NewsEditorModal
            key={editor.mode === 'edit' ? editor.news.id : 'new'}
            mode={editor.mode}
            initialTitle={editor.mode === 'edit' ? editor.news.title : ''}
            initialHtml={editor.mode === 'edit' ? editor.news.contentHtml : ''}
            loading={createNews.isPending || updateNews.isPending}
            onClose={closeEditor}
            onSubmit={handleSubmit}
          />
        </Suspense>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title="Excluir notícia"
        code="NEWS"
        confirmLabel="Excluir notícia"
        loading={deleteNews.isPending}
        onConfirm={handleDelete}
        onCancel={closeDelete}
      >
        <p>
          <strong>{toDelete?.title}</strong> será removida para todos. Essa ação não pode ser desfeita.
        </p>
      </ConfirmDialog>
    </Panel>
  )
}
