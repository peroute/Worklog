import { useEffect, useRef, useState } from 'react'
import { ErrorState } from '../../components/ErrorState'
import { ui } from '../../components/ui'
import { ACTION_LABEL, needsComment, needsReason, type FindingAction, type TaskAction } from '../../domain/actions'
import { CommentRequiredDialog } from './CommentRequiredDialog'

type Action = FindingAction | TaskAction

interface StatusActionsProps {
  actions: Action[]
  /** It is this person's turn: show the buttons. Otherwise tuck them under "More". */
  primary: boolean
  /** Runs the move. Reject to refuse it: the message is shown here. `text` = the comment or reason. */
  onRun: (action: Action, text?: string) => Promise<void>
}

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong')

/**
 * The status buttons for one item. Moves that need words (a comment, a block reason) open a dialog first.
 * Which actions exist is decided in domain/actions.ts; this only lays them out.
 */
export function StatusActions({ actions, primary, onRun }: StatusActionsProps) {
  const [asking, setAsking] = useState<Action | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // The menu closes on Escape or a click anywhere outside it.
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false)
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [menuOpen])

  async function run(action: Action, text?: string): Promise<boolean> {
    setBusy(true)
    setError(null)
    try {
      await onRun(action, text)
      return true
    } catch (err) {
      setError(errorMessage(err))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function choose(action: Action) {
    setMenuOpen(false)
    if (needsComment(action) || needsReason(action)) {
      setError(null)
      setAsking(action)
      return
    }
    await run(action, undefined)
  }

  if (actions.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start gap-2">
        {primary ? (
          actions.map((action, index) => (
            <button
              key={action}
              type="button"
              disabled={busy}
              onClick={() => choose(action)}
              className={index === 0 ? ui.btnPrimary : ui.btnSecondary}
            >
              {ACTION_LABEL[action]}
            </button>
          ))
        ) : (
          <div ref={menuRef} className="relative">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              className={ui.btnSecondary}
            >
              More
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute left-0 z-10 mt-1 flex min-w-44 flex-col rounded-lg border border-line bg-surface p-1 shadow-lg"
              >
                {actions.map((action) => (
                  <button
                    key={action}
                    type="button"
                    role="menuitem"
                    disabled={busy}
                    onClick={() => choose(action)}
                    className="rounded-md px-3 py-2 text-left text-sm text-fg hover:bg-surface-2 disabled:opacity-50"
                  >
                    {ACTION_LABEL[action]}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Refused one-click moves show here; moves with a dialog show it inside the dialog. */}
      {error && !asking && <ErrorState error={new Error(error)} />}

      {asking && (
        <CommentRequiredDialog
          title={ACTION_LABEL[asking]}
          label={needsReason(asking) ? "What's blocking it?" : 'Comment'}
          error={error}
          maxLength={needsReason(asking) ? 500 : undefined}
          onCancel={() => {
            setAsking(null)
            setError(null)
          }}
          onSubmit={async (text) => {
            if (await run(asking, text)) setAsking(null)
          }}
        />
      )}
    </div>
  )
}
