// Turns the task form's edited checklist into the smallest set of database changes.
import { MAX_CHECKLIST_TITLE } from '../data/limits'
import type { ChecklistItem } from '../data/types'

/** An item in the form. `id` = already saved; no `id` = new. */
export interface DraftItem {
  id?: string
  title: string
}

export interface ChecklistOps {
  remove: string[]
  rename: { id: string; title: string }[]
  add: { title: string; position: number }[]
  reposition: { id: string; position: number }[]
}

export function isValidChecklistTitle(title: string): boolean {
  const length = title.trim().length
  return length >= 1 && length <= MAX_CHECKLIST_TITLE
}

/**
 * Each item's target position is its index in `draft`. Draft ids that aren't in `saved`
 * (deleted elsewhere since the form loaded) are skipped, so saving never fails on them.
 * Titles are trimmed; blocking invalid titles is the caller's job.
 */
export function diffChecklist(saved: ChecklistItem[], draft: DraftItem[]): ChecklistOps {
  const savedById = new Map(saved.map((item) => [item.id, item]))
  const kept = new Set<string>()
  const ops: ChecklistOps = { remove: [], rename: [], add: [], reposition: [] }

  draft.forEach((item, position) => {
    const title = item.title.trim()
    if (item.id === undefined) {
      ops.add.push({ title, position })
      return
    }
    const existing = savedById.get(item.id)
    if (!existing) return
    kept.add(existing.id)
    if (existing.title !== title) ops.rename.push({ id: existing.id, title })
    if (existing.position !== position) ops.reposition.push({ id: existing.id, position })
  })

  ops.remove = saved.filter((item) => !kept.has(item.id)).map((item) => item.id)
  return ops
}

/**
 * What the edit form should write on Save, given:
 *   atOpen  — the list when the form opened (what the user saw and edited)
 *   current — the list fetched right before saving (others may have changed it meanwhile)
 * Writes go against `current`, so items deleted elsewhere are skipped instead of failing the save.
 * Only items the user removed are deleted: anything added elsewhere after the form opened is kept.
 */
export function planChecklistSave(atOpen: ChecklistItem[], current: ChecklistItem[], draft: DraftItem[]): ChecklistOps {
  const seenAtOpen = new Set(atOpen.map((item) => item.id))
  const ops = diffChecklist(current, draft)
  return { ...ops, remove: ops.remove.filter((id) => seenAtOpen.has(id)) }
}
