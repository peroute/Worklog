import { useEffect, useId, useState } from 'react'
import { ErrorState } from '../../components/ErrorState'
import { ui } from '../../components/ui'

interface CommentRequiredDialogProps {
  /** The action's label: shown as the heading and on the submit button. */
  title: string
  /** What the text field is asking for ("Comment", "What's blocking it?"). */
  label: string
  onSubmit: (text: string) => Promise<void>
  onCancel: () => void
  /** Why the last try failed; the dialog stays open so nothing typed is lost. */
  error?: string | null
  /** Cap on the text length (the database limits the block reason to 500). */
  maxLength?: number
}

/** Some status moves only make sense with words attached ("Need more info" needs the question). */
export function CommentRequiredDialog({ title, label, onSubmit, onCancel, error, maxLength }: CommentRequiredDialogProps) {
  const titleId = useId()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (sending) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [sending, onCancel])

  async function send() {
    setSending(true)
    try {
      await onSubmit(text.trim())
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg rounded-2xl border border-line bg-surface p-6 shadow-xl"
      >
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        <label className={`${ui.label} mt-4`}>
          {label}
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} autoFocus maxLength={maxLength} className={ui.input} />
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
          <button type="button" onClick={send} disabled={!text.trim() || sending} className={ui.btnPrimary}>
            {title}
          </button>
        </div>
      </div>
    </div>
  )
}
