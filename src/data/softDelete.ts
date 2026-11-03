import { supabase } from '../lib/supabase'
import { DataError, toDataError } from './errors'

type SoftDeletableTable = 'projects' | 'tasks' | 'findings' | 'finding_images' | 'task_attachments'

/**
 * "Delete" = hide. We send any non-null timestamp; the database overwrites it with now() and
 * stamps deleted_by itself (trigger stamp_deleted), so the client can't forge either.
 * Storage files are never touched: a restore must find them exactly where they were.
 */
export async function softDelete(table: SoftDeletableTable, id: string, label: string): Promise<void> {
  await setDeletedAt(table, id, new Date().toISOString(), label)
}

/** Undo of softDelete: deleted_at back to null (the database clears deleted_by). */
export async function restore(table: SoftDeletableTable, id: string, label: string): Promise<void> {
  await setDeletedAt(table, id, null, label)
}

async function setDeletedAt(table: SoftDeletableTable, id: string, value: string | null, label: string): Promise<void> {
  const { data, error } = await supabase.from(table).update({ deleted_at: value }).eq('id', id).select('id')
  if (error) throw toDataError(error)
  // An update that matches no row isn't an error to Postgres; for the user it means "that's gone".
  if (!data || data.length === 0) throw new DataError(`${label} not found`)
}
