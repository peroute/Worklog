import { useId, useState, type KeyboardEvent } from 'react'
import { ui } from '../../components/ui'
import { MAX_CHECKLIST_ITEMS } from '../../data/limits'
import { isValidChecklistTitle, type DraftItem } from '../../domain/checklist'
import { CHECKLIST_FULL, CHECKLIST_TITLE_ERROR, checklistIconBtn } from './ChecklistSection'

interface ChecklistEditorProps {
  items: DraftItem[]
  onChange: (items: DraftItem[]) => void
  /** Text in the "Add an item…" box. Held by the form so Save can include it even without Enter. */
  pending: string
  onPendingChange: (text: string) => void
  disabled?: boolean
}

/**
 * The task form's checklist: a draft list, saved together with the task (see diffChecklist).
 * Lives inside TaskForm's <form>, so it can't be a form itself: Enter is caught on the input
 * and the Add button is type="button", otherwise adding an item would submit the whole task.
 */
export function ChecklistEditor({ items, onChange, pending, onPendingChange, disabled = false }: ChecklistEditorProps) {
  const inputId = useId()
  const [titleError, setTitleError] = useState<string | null>(null)
  const full = items.length >= MAX_CHECKLIST_ITEMS

  function add() {
    if (!isValidChecklistTitle(pending)) {
      setTitleError(CHECKLIST_TITLE_ERROR)
      return
    }
    setTitleError(null)
    onChange([...items, { title: pending.trim() }])
    onPendingChange('')
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault() // keep Enter from submitting the task form
    add()
  }

  function move(index: number, to: number) {
    const next = [...items]
    ;[next[index], next[to]] = [next[to], next[index]]
    onChange(next)
  }

  return (
    <div>
      <label htmlFor={inputId} className={ui.label}>
        Checklist <span className="font-normal text-fg-muted">(optional)</span>
      </label>

      {items.length > 0 && (
        <ul className="mt-1.5 divide-y divide-line overflow-hidden rounded-lg border border-line">
          {items.map((item, index) => (
            <li key={item.id ?? `new-${index}`} className="flex items-center gap-2.5 bg-surface px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 break-words text-fg">{item.title}</span>
              <span className="flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={() => move(index, index - 1)}
                  disabled={disabled || index === 0}
                  aria-label={`Move ${item.title} up`}
                  className={checklistIconBtn}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(index, index + 1)}
                  disabled={disabled || index === items.length - 1}
                  aria-label={`Move ${item.title} down`}
                  className={checklistIconBtn}
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => onChange(items.filter((_, i) => i !== index))}
                  disabled={disabled}
                  aria-label={`Remove ${item.title}`}
                  className={`${checklistIconBtn} hover:bg-overdue-soft hover:text-overdue`}
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex gap-2">
        <input
          id={inputId}
          value={pending}
          onChange={(e) => onPendingChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Add an item…"
          disabled={disabled || full}
          className={ui.input.replace('mt-1.5 ', '')}
        />
        <button type="button" onClick={add} disabled={disabled || full} className={ui.btnSecondary}>
          Add
        </button>
      </div>
      {full ? (
        <p className="mt-1 text-xs text-fg-muted">{CHECKLIST_FULL}</p>
      ) : (
        <p className="mt-1 text-xs text-fg-subtle">Steps the assignee ticks off as they go.</p>
      )}
      {titleError && <p className={ui.fieldError}>{titleError}</p>}
    </div>
  )
}
