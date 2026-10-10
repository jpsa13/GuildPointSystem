import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/Shared/ui/components/Button/Button'
import '@/Features/Auth/Auth.styles.scss'
import './ConfirmDialog.styles.scss'

interface ConfirmDialogProps {
  open: boolean
  title: string
  /** Small tag on the window bar (e.g. "ADM"). */
  code?: string
  children: ReactNode
  confirmLabel: string
  cancelLabel?: string
  variant?: 'danger' | 'primary'
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Themed replacement for `window.confirm`. Escape / backdrop cancel (unless loading);
 * focus starts on "Cancelar" so a stray Enter never triggers a destructive action.
 */
export function ConfirmDialog({
  open,
  title,
  code,
  children,
  confirmLabel,
  cancelLabel = 'Cancelar',
  variant = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    cardRef.current?.querySelector<HTMLButtonElement>('[data-autofocus]')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, loading, onCancel])

  if (!open) return null

  // Portal: panels use clip-path, which would clip a fixed overlay rendered inside them.
  return createPortal(
    <div className="modal-overlay" role="presentation" onClick={() => !loading && onCancel()}>
      <div
        ref={cardRef}
        className={`modal-card confirm-dialog confirm-dialog--${variant}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="auth-window-bar">
          <span id="confirm-dialog-title">{title}</span>
          {code && <span className="auth-window-bar__code">{code}</span>}
        </div>
        <div className="auth-card-content confirm-dialog__body">
          <div className="confirm-dialog__message">{children}</div>
          <div className="confirm-dialog__actions">
            <Button data-autofocus type="button" variant="secondary" onClick={onCancel} disabled={loading}>
              {cancelLabel}
            </Button>
            <Button type="button" variant={variant} onClick={onConfirm} loading={loading}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
