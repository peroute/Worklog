import { supabase } from '../lib/supabase'
import { DataError, toDataError } from './errors'
import { taskPatchToRow, toTask, type TaskRow } from './mappers'
import { listTaskAttachmentPaths, removeTaskAttachmentFiles } from './taskAttachments'
import type { NewTask, Task, TaskStatus } from './types'

/** Every task read embeds its checklist's done flags, so rows can show "2/5" without another request. */
const TASK_COLUMNS = '*, checklist:task_checklist_items(done)'

export async function listTasks(
  filter: { projectId?: string; assignedTo?: string; status?: TaskStatus } = {},
): Promise<Task[]> {
  let query = supabase.from('tasks').select(TASK_COLUMNS)
  if (filter.projectId) query = query.eq('project_id', filter.projectId)
  if (filter.assignedTo) query = query.eq('assigned_to', filter.assignedTo)
  if (filter.status) query = query.eq('status', filter.status)
  // Soonest deadline first; tasks without a deadline after those with one.
  const { data, error } = await query
    .order('deadline', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
  if (error) throw toDataError(error)
  return (data as TaskRow[]).map(toTask)
}

export async function getTask(id: string): Promise<Task> {
  const { data, error } = await supabase.from('tasks').select(TASK_COLUMNS).eq('id', id).single()
  if (error) throw toDataError(error, { notFound: 'Task not found' })
  return toTask(data as TaskRow)
}

export async function createTask(input: NewTask): Promise<Task> {
  const { data, error } = await supabase.from('tasks').insert(taskPatchToRow(input)).select(TASK_COLUMNS).single()
  if (error) throw toDataError(error)
  return toTask(data as TaskRow)
}

export async function updateTask(id: string, patch: Partial<NewTask>): Promise<Task> {
  const { data, error } = await supabase.from('tasks').update(taskPatchToRow(patch)).eq('id', id).select(TASK_COLUMNS).single()
  if (error) throw toDataError(error, { notFound: 'Task not found' })
  return toTask(data as TaskRow)
}

export async function setTaskStatus(id: string, status: TaskStatus): Promise<Task> {
  const { data, error } = await supabase.from('tasks').update({ status }).eq('id', id).select(TASK_COLUMNS).single()
  if (error) throw toDataError(error, { notFound: 'Task not found' })
  return toTask(data as TaskRow)
}

/**
 * The assignee hands in their work: note + status in ONE update, so the lead never sees
 * "Submitted" without the explanation (or the reverse).
 * `status: null` = only edit the note. `note: undefined` = leave the note as it is.
 */
export async function submitTask(
  id: string,
  { note, status }: { note?: string | null; status: Extract<TaskStatus, 'submitted' | 'resubmitted'> | null },
): Promise<Task> {
  const patch: Record<string, unknown> = {}
  if (note !== undefined) patch.submission_note = note
  if (status) patch.status = status
  const { data, error } = await supabase.from('tasks').update(patch).eq('id', id).select(TASK_COLUMNS).single()
  if (error) throw toDataError(error, { notFound: 'Task not found' })
  return toTask(data as TaskRow)
}

/** Same order as deleteFinding: attachment paths → row (permission check) → files. */
export async function deleteTask(id: string): Promise<void> {
  const paths = await listTaskAttachmentPaths([id])
  const { data, error } = await supabase.from('tasks').delete().eq('id', id).select('id')
  if (error) throw toDataError(error)
  if (!data || data.length === 0) throw new DataError('Only the creator or lead can delete this task')
  await removeTaskAttachmentFiles(paths)
}

/** Lead only: sends a task back to its assignee with a required comment (one DB transaction). */
export async function requestChangesTask(id: string, body: string): Promise<void> {
  const { error } = await supabase.rpc('request_changes_task', { p_id: id, p_body: body })
  if (error) throw toDataError(error)
}
