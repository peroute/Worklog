import { useId, useState, type FormEvent } from 'react'
import { ui } from '../../components/ui'
import { MAX_CHECKLIST_ITEMS } from '../../data/limits'
import type { ChecklistItem, Profile, Task } from '../../data/types'
import { isValidChecklistTitle } from '../../domain/checklist'
import { canEditChecklist, canTickChecklist } from '../../domain/permissions'
import { formatDayHeading, toTeamDate } from '../../lib/dates'
import { nameOf, useProfiles } from '../team/queries'
import {
  useAddChecklistItem,
  useChecklist,
  useMoveChecklistItem,
  useRemoveChecklistItem,
  useToggleChecklistItem,
} from './checklistQueries'

export const CHECKLIST_TITLE_ERROR = 'Items need 1–200 characters'
export const CHECKLIST_FULL = `Checklist is full (${MAX_CHECKLIST_ITEMS} items)`

export const checklistIconBtn =
  'inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent'

/** "2 of 5" plus a thin progress bar. */
export function ChecklistProgress({ done, total }: { done: number; total: number }) {
  return (
    <span className="flex items-center gap-2 text-xs font-medium tracking-normal normal-case">
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
        <span className="block h-full bg-done transition-[width]" style={{ width: total ? `${(done / total) * 100}%` : 0 }} />
      </span>
      <span className="text-fg-muted">
        {done} of {total}
      </span>
    </span>
  )
}

/**
 * The task page's checklist. The creator/lead writes it (add, move, remove); the assignee ticks it.
 * Which controls show mirrors the DB rules (task_checklist_items_guard); the DB has the last word.
 */
export function ChecklistSection({ task, me }: { task: Task; me: Profile | undefined }) {
  const headingId = useId()
  const checklist = useChecklist(task.id)
  const profiles = useProfiles()
  const toggle = useToggleChecklistItem(task.id)
  const add = useAddChecklistItem(task.id)
  const remove = useRemoveChecklistItem()
  const move = useMoveChecklistItem(task.id)
  const [draft, setDraft] = useState('')
  const [titleError, setTitleError] = useState<string | null>(null)

  const items = checklist.data ?? []
  const canEdit = me ? canEditChecklist(me, task) : false
  const canTick = me ? canTickChecklist(me, task) : false
  if (!checklist.isSuccess || (items.length === 0 && !canEdit)) return null

  const full = items.length >= MAX_CHECKLIST_ITEMS
  const done = items.filter((i) => i.done).length
  const failure = toggle.error ?? add.error ?? remove.error ?? move.error

  function onAdd(e: FormEvent) {
    e.preventDefault()
    if (!isValidChecklistTitle(draft)) {
      setTitleError(CHECKLIST_TITLE_ERROR)
      return
    }
    setTitleError(null)
    add.mutate(draft.trim(), { onSuccess: () => setDraft('') })
  }

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className={`${ui.sectionTitle} mb-1.5 flex items-center gap-3`}>
        Checklist
        {items.length > 0 && <ChecklistProgress done={done} total={items.length} />}
      </h2>

      {items.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
          {items.map((item, index) => (
            <ChecklistRow
              key={item.id}
              item={item}
              first={index === 0}
              last={index === items.length - 1}
              canTick={canTick}
              canEdit={canEdit}
              doneByName={item.doneBy ? nameOf(profiles.data, item.doneBy) : null}
              onToggle={(value) => toggle.mutate({ id: item.id, done: value })}
              onMove={(direction) => move.mutate({ id: item.id, direction })}
              onRemove={() => remove.mutate(item.id)}
            />
          ))}
        </ul>
      )}

      {canEdit && (
        <form onSubmit={onAdd} className="mt-2 flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add an item…"
            aria-label="New checklist item"
            disabled={full || add.isPending}
            className={ui.input.replace('mt-1.5 ', '')}
          />
          <button type="submit" disabled={full || add.isPending} className={ui.btnSecondary}>
            Add
          </button>
        </form>
      )}
      {canEdit && full && <p className="mt-1 text-xs text-fg-muted">{CHECKLIST_FULL}</p>}
      {titleError && <p className={ui.fieldError}>{titleError}</p>}
      {failure && (
        <p role="alert" className={ui.fieldError}>
          {failure.message}
        </p>
      )}
    </section>
  )
}

interface ChecklistRowProps {
  item: ChecklistItem
  first: boolean
  last: boolean
  canTick: boolean
  canEdit: boolean
  doneByName: string | null
  onToggle: (done: boolean) => void
  onMove: (direction: 'up' | 'down') => void
  onRemove: () => void
}

function ChecklistRow({ item, first, last, canTick, canEdit, doneByName, onToggle, onMove, onRemove }: ChecklistRowProps) {
  return (
    <li className="flex items-center gap-2.5 bg-surface px-3 py-2 text-sm">
      <input
        type="checkbox"
        checked={item.done}
        disabled={!canTick}
        onChange={(e) => onToggle(e.target.checked)}
        aria-label={item.title}
        className="h-4 w-4 shrink-0 cursor-pointer accent-blue-600 disabled:cursor-not-allowed"
      />
      <span className={`min-w-0 flex-1 break-words ${item.done ? 'text-fg-subtle line-through' : 'text-fg'}`}>
        {item.title}
      </span>
      {item.done && doneByName && item.doneAt && (
        <span className="shrink-0 text-xs text-fg-subtle">
          ✓ {doneByName} · {formatDayHeading(toTeamDate(item.doneAt))}
        </span>
      )}
      {canEdit && (
        <span className="flex shrink-0 items-center">
          <button type="button" onClick={() => onMove('up')} disabled={first} aria-label={`Move ${item.title} up`} className={checklistIconBtn}>
            ↑
          </button>
          <button type="button" onClick={() => onMove('down')} disabled={last} aria-label={`Move ${item.title} down`} className={checklistIconBtn}>
            ↓
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${item.title}`}
            className={`${checklistIconBtn} hover:bg-overdue-soft hover:text-overdue`}
          >
            ×
          </button>
        </span>
      )}
    </li>
  )
}
