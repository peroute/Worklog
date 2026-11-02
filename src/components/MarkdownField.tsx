import { useId, useState } from 'react'
import { Markdown } from './Markdown'
import { ui } from './ui'

interface MarkdownFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  rows?: number
  error?: string
}

type Mode = 'write' | 'preview'

const toggleBase = 'rounded-md px-2.5 py-1 text-xs font-medium transition-colors'
const toggleOn = `${toggleBase} bg-surface text-fg shadow-sm dark:shadow-none`
const toggleOff = `${toggleBase} text-fg-muted hover:text-fg`

/**
 * A textarea for Markdown with a Write / Preview toggle, so authors see exactly what readers will see.
 * Preview reuses <Markdown>, the same renderer as the detail pages, so the two can never drift apart.
 * The textarea unmounts in preview mode; the text lives in the parent's state, so nothing is lost.
 */
export function MarkdownField({ label, value, onChange, rows = 5, error }: MarkdownFieldProps) {
  const [mode, setMode] = useState<Mode>('write')
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  // Keep the box the same height in both modes so the form doesn't jump when toggling (~1.5rem per row + padding).
  const minHeight = `${rows * 1.5 + 1}rem`

  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <label htmlFor={id} className={ui.label}>
          {label}
        </label>
        <div className="inline-flex rounded-lg bg-surface-2 p-0.5" role="group" aria-label={`${label} view`}>
          <button type="button" aria-pressed={mode === 'write'} onClick={() => setMode('write')} className={mode === 'write' ? toggleOn : toggleOff}>
            Write
          </button>
          <button type="button" aria-pressed={mode === 'preview'} onClick={() => setMode('preview')} className={mode === 'preview' ? toggleOn : toggleOff}>
            Preview
          </button>
        </div>
      </div>

      {mode === 'write' ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          aria-invalid={error ? true : undefined}
          className={ui.input}
        />
      ) : (
        <div
          className="mt-1.5 overflow-auto rounded-lg border border-line bg-surface-2/40 px-3 py-2"
          style={{ minHeight }}
          role="region"
          aria-label={`${label} preview`}
        >
          {value.trim() ? (
            <Markdown className="text-sm leading-relaxed text-fg">{value}</Markdown>
          ) : (
            <p className="text-sm text-fg-subtle">Nothing to preview yet.</p>
          )}
        </div>
      )}

      {error && (
        <span id={errorId} className={ui.fieldError}>
          {error}
        </span>
      )}
      <p id={hintId} className="mt-1 text-xs text-fg-subtle">
        Markdown supported: **bold**, - lists, [links](url), `code`
      </p>
    </div>
  )
}
