import { supabase } from '../lib/supabase'
import { DataError, toDataError } from './errors'
import { taskPatchToRow, toTask, type TaskRow } from './mappers'
import type { NewTask, Task, TaskStatus } from './types'

export async function listTasks(
  filter: { projectId?: string; assignedTo?: string; status?: TaskStatus } = {},
): Promise<Task[]> {
  let query = supabase.from('tasks').select('*')
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
  const { data, error } = await supabase.from('tasks').select('*').eq('id', id).single()
  if (error) throw toDataError(error, { notFound: 'Task not found' })
  return toTask(data as TaskRow)
}

export async function createTask(input: NewTask): Promise<Task> {
  const { data, error } = await supabase.from('tasks').insert(taskPatchToRow(input)).select('*').single()
  if (error) throw toDataError(error)
  return toTask(data as TaskRow)
}

export async function updateTask(id: string, patch: Partial<NewTask>): Promise<Task> {
  const { data, error } = await supabase.from('tasks').update(taskPatchToRow(patch)).eq('id', id).select('*').single()
  if (error) throw toDataError(error, { notFound: 'Task not found' })
  return toTask(data as TaskRow)
}

export async function setTaskStatus(id: string, status: TaskStatus): Promise<Task> {
  const { data, error } = await supabase.from('tasks').update({ status }).eq('id', id).select('*').single()
  if (error) throw toDataError(error, { notFound: 'Task not found' })
  return toTask(data as TaskRow)
}

export async function deleteTask(id: string): Promise<void> {
  const { data, error } = await supabase.from('tasks').delete().eq('id', id).select('id')
  if (error) throw toDataError(error)
  if (!data || data.length === 0) throw new DataError('Only the creator or lead can delete this task')
}

/** Lead only: sends a task back to its assignee with a required comment (one DB transaction). */
export async function sendBackTask(id: string, body: string): Promise<void> {
  const { error } = await supabase.rpc('send_back_task', { p_id: id, p_body: body })
  if (error) throw toDataError(error)
}
