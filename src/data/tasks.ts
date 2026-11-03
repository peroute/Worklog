import { supabase } from '../lib/supabase'
import { toDataError } from './errors'
import { taskPatchToRow, toTask, type TaskRow } from './mappers'
import { restore, softDelete } from './softDelete'
import type { NewTask, Task, TaskStatus } from './types'

/** Every task read embeds its checklist's done flags, so rows can show "2/5" without another request. */
const TASK_COLUMNS = '*, checklist:task_checklist_items(done)'

export async function listTasks(
  filter: { projectId?: string; assignedTo?: string; status?: TaskStatus } = {},
): Promise<Task[]> {
  // live_tasks hides deleted tasks and those of deleted projects.
  let query = supabase.from('live_tasks').select(TASK_COLUMNS)
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
  const { data, error } = await supabase.from('live_tasks').select(TASK_COLUMNS).eq('id', id).single()
  if (error) throw toDataError(error, { notFound: 'Task not found' })
  return toTask(data as TaskRow)
}

export async function createTask(input: NewTask): Promise<Task> {
  const { data, error } = await supabase.from('tasks').insert(taskPatchToRow(input)).select(TASK_COLUMNS).single()
  if (error) throw toDataError(error)
  return toTask(data as TaskRow)
}

/** Edits fields. `submissionNote` lets a note-only edit (no status change) go through here. */
export async function updateTask(
  id: string,
  patch: Partial<NewTask> & { submissionNote?: string | null },
): Promise<Task> {
  const { data, error } = await supabase.from('tasks').update(taskPatchToRow(patch)).eq('id', id).select(TASK_COLUMNS).single()
  if (error) throw toDataError(error, { notFound: 'Task not found' })
  return toTask(data as TaskRow)
}

/**
 * The only way to change a task's status. One database call checks the move is allowed and saves,
 * together with the status: the comment (thread), the blocked reason, and the "what I did" note.
 * Either everything lands or nothing does.
 */
export async function setTaskStatus(
  id: string,
  to: TaskStatus,
  opts: { comment?: string; reason?: string; note?: string } = {},
): Promise<void> {
  const { error } = await supabase.rpc('set_task_status', {
    p_id: id,
    p_to: to,
    p_comment: opts.comment ?? null,
    p_reason: opts.reason ?? null,
    p_note: opts.note ?? null,
  })
  if (error) throw toDataError(error)
}

/** Hides the task (soft delete). Attachment files stay in storage so a restore is lossless. */
export const deleteTask = (id: string): Promise<void> => softDelete('tasks', id, 'Task')

export const restoreTask = (id: string): Promise<void> => restore('tasks', id, 'Task')
