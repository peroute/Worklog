import { supabase } from '../lib/supabase'
import { toDataError } from './errors'
import type { ItemRef } from './types'

/** When I last opened this item, or null if I never have. */
export async function getLastSeen(ref: ItemRef): Promise<string | null> {
  const { data, error } = await supabase
    .from('item_reads')
    .select('last_seen_at')
    .eq('item_type', ref.type)
    .eq('item_id', ref.id)
    .maybeSingle()
  if (error) throw toDataError(error)
  return (data as { last_seen_at: string } | null)?.last_seen_at ?? null
}

/** "I just opened this." The database stamps the time itself. */
export async function markSeen(ref: ItemRef): Promise<void> {
  const { error } = await supabase.rpc('mark_seen', { p_type: ref.type, p_id: ref.id })
  if (error) throw toDataError(error)
}

/** Items where someone else acted since I last looked (the NEW markers). */
export async function listUnseen(): Promise<ItemRef[]> {
  const { data, error } = await supabase.rpc('unseen_items')
  if (error) throw toDataError(error)
  return (data as { item_type: ItemRef['type']; item_id: string }[]).map((r) => ({
    type: r.item_type,
    id: r.item_id,
  }))
}
