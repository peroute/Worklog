import type { ReactNode } from 'react'
import { ui } from './ui'

interface ConfirmDialogProps {
  open: boolean
  title: string
  body: ReactNode
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  /** Disables both buttons while the action runs. */
  busy?: boolean
  /** Disables only the confirm button (e.g. still loading what it will do). */
  confirmDisabled?: boolean
}

/** A simple modal "are you sure?" for destructive actions. Sits at the bottom on phones. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
  busy = false,
  confirmDisabled = false,
}: ConfirmDialogProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-xl"
      >
        <h2 id="confirm-title" className="text-lg font-semibold text-fg">
          {title}
        </h2>
        <div className="mt-2 text-sm leading-relaxed text-fg-muted">{body}</div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} disabled={busy} className={ui.btnSecondary}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={busy || confirmDisabled} className={ui.btnDanger}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
