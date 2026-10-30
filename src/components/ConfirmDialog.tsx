import type { ReactNode } from 'react'

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

/** A simple modal "are you sure?" for destructive actions. */
export function ConfirmDialog({ open, title, body, confirmLabel, onConfirm, onCancel, busy = false, confirmDisabled = false }: ConfirmDialogProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
        <h2 id="confirm-title" className="text-lg font-semibold">
          {title}
        </h2>
        <div className="mt-2 text-sm text-gray-600">{body}</div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="rounded px-4 py-2 text-sm hover:bg-gray-100">
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || confirmDisabled}
            className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
