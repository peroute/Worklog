import { supabase } from '../lib/supabase'
import { toDataError } from './errors'
import { toComment, type CommentRow } from './mappers'
import type { Comment, CommentTarget } from './types'

const COLUMNS = 'id, finding_id, task_id, author_id, body, created_at'

/** The thread for one finding or task, oldest first. */
export async function listComments(target: CommentTarget): Promise<Comment[]> {
  let query = supabase.from('comments').select(COLUMNS)
  query = 'findingId' in target ? query.eq('finding_id', target.findingId) : query.eq('task_id', target.taskId)
  const { data, error } = await query.order('created_at', { ascending: true })
  if (error) throw toDataError(error)
  return (data as CommentRow[]).map(toComment)
}

/** Newest comment per item (Review page previews), keyed by finding or task id. */
export async function listLatestComments(target: {
  findingIds?: string[]
  taskIds?: string[]
}): Promise<Record<string, Comment>> {
  const findingIds = target.findingIds ?? []
  const taskIds = target.taskIds ?? []
  if (findingIds.length === 0 && taskIds.length === 0) return {}

  const filters = [
    findingIds.length > 0 ? `finding_id.in.(${findingIds.join(',')})` : null,
    taskIds.length > 0 ? `task_id.in.(${taskIds.join(',')})` : null,
  ].filter(Boolean)
  const { data, error } = await supabase
    .from('comments')
    .select(COLUMNS)
    .or(filters.join(','))
    .order('created_at', { ascending: false })
  if (error) throw toDataError(error)

  // Rows arrive newest first, so the first one seen per item is its latest.
  const latest: Record<string, Comment> = {}
  for (const comment of (data as CommentRow[]).map(toComment)) {
    const key = (comment.findingId ?? comment.taskId) as string
    latest[key] ??= comment
  }
  return latest
}

export async function addComment(target: CommentTarget, body: string): Promise<Comment> {
  const row: { finding_id?: string; task_id?: string; body: string } =
    'findingId' in target ? { finding_id: target.findingId, body } : { task_id: target.taskId, body }
  const { data, error } = await supabase.from('comments').insert(row).select(COLUMNS).single()
  if (error) throw toDataError(error)
  return toComment(data as CommentRow)
}
