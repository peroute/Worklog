import { supabase } from '../lib/supabase'
import { toDataError } from './errors'
import { toActivityEntry, type ActivityRow } from './mappers'
import type { ActivityEntry, CommentTarget } from './types'

const COLUMNS = 'id, actor_id, action, details, created_at'

/** History of one finding or task, oldest first. Rows come from database triggers; the client never writes them. */
export async function listActivity(target: CommentTarget): Promise<ActivityEntry[]> {
  let query = supabase.from('activity').select(COLUMNS)
  query = 'findingId' in target ? query.eq('finding_id', target.findingId) : query.eq('task_id', target.taskId)
  // Rows written in one transaction share created_at, so id is the stable tiebreak.
  const { data, error } = await query.order('created_at', { ascending: true }).order('id', { ascending: true })
  if (error) throw toDataError(error)
  return (data as ActivityRow[]).map(toActivityEntry)
}
