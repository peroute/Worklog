// Task checklist items. Who may change what is decided by the database
// (task_checklist_items_guard + RLS); these functions just send the request.
import { supabase } from '../lib/supabase'
import { toDataError } from './errors'
import { toChecklistItem, type ChecklistItemRow } from './mappers'
import type { ChecklistItem } from './types'

const COLUMNS = 'id, task_id, title, position, done, done_by, done_at, created_at'

const table = () => supabase.from('task_checklist_items')

export async function listChecklist(taskId: string): Promise<ChecklistItem[]> {
  const { data, error } = await table()
    .select(COLUMNS)
    .eq('task_id', taskId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw toDataError(error)
  return (data as ChecklistItemRow[]).map(toChecklistItem)
}

export async function addChecklistItems(
  taskId: string,
  items: { title: string; position: number }[],
): Promise<ChecklistItem[]> {
  if (items.length === 0) return []
  const rows = items.map((i) => ({ task_id: taskId, title: i.title.trim(), position: i.position }))
  const { data, error } = await table().insert(rows).select(COLUMNS)
  if (error) throw toDataError(error)
  return (data as ChecklistItemRow[]).map(toChecklistItem)
}

export async function renameChecklistItem(id: string, title: string): Promise<ChecklistItem> {
  return updateOne(id, { title: title.trim() })
}

/** done_by / done_at are filled in by the database from the logged-in user. */
export async function setChecklistItemDone(id: string, done: boolean): Promise<ChecklistItem> {
  return updateOne(id, { done })
}

/** Saves new positions one row at a time (PostgREST has no multi-row update with different values). */
export async function setChecklistPositions(items: { id: string; position: number }[]): Promise<void> {
  for (const item of items) {
    await updateOne(item.id, { position: item.position })
  }
}

export async function removeChecklistItems(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await table().delete().in('id', ids)
  if (error) throw toDataError(error)
}

/**
 * Updates one row and returns it. `.single()` also turns "RLS hid the row, nothing changed"
 * into an error, so a refused update never looks like a success.
 */
async function updateOne(id: string, patch: Record<string, unknown>): Promise<ChecklistItem> {
  const { data, error } = await table().update(patch).eq('id', id).select(COLUMNS).single()
  if (error) throw toDataError(error)
  return toChecklistItem(data as ChecklistItemRow)
}
