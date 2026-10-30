import { useState } from 'react'
import { ErrorState } from '../../components/ErrorState'
import { ui } from '../../components/ui'

interface SendBackDialogProps {
  open: boolean
  itemTitle: string
  onSubmit: (body: string) => Promise<unknown>
  onCancel: () => void
}

/** Lead only. Sending work back always comes with a comment saying what needs fixing. */
export function SendBackDialog({ open, itemTitle, onSubmit, onCancel }: SendBackDialogProps) {
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!open) return null

  async function send() {
    setError(null)
    setSending(true)
    try {
      await onSubmit(body)
      setBody('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send it back')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="send-back-title"
        className="w-full max-w-lg rounded-2xl border border-line border-t-4 border-t-review-edge bg-surface p-6 shadow-xl"
      >
        <h2 id="send-back-title" className="text-lg font-semibold">
          Send back for review
        </h2>
        <p className="mt-1 text-sm text-fg-muted">“{itemTitle}” goes back to its owner with your comment.</p>
        <label className={`${ui.label} mt-4`}>
          What needs fixing?
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} autoFocus className={ui.input} />
        </label>
        {error && (
          <div className="mt-3">
            <ErrorState error={new Error(error)} />
          </div>
        )}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} disabled={sending} className={ui.btnSecondary}>
            Cancel
          </button>
          <button
            type="button"
            onClick={send}
            disabled={!body.trim() || sending}
            className={`${ui.btnPrimary} bg-review-edge hover:bg-review-edge/90`}
          >
            Send back
          </button>
        </div>
      </div>
    </div>
  )
}
