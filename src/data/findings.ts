import { supabase } from '../lib/supabase'
import { toDataError } from './errors'
import { signImagePaths, uploadFindingImages } from './images'
import { findingPatchToRow, toFinding, toFindingImage, type FindingImageRow, type FindingRow } from './mappers'
import { restore, softDelete } from './softDelete'
import type { Finding, FindingDetail, FindingStatus, NewFinding } from './types'

// Every finding query also asks for its (live) screenshot count.
const FINDING_COLUMNS = '*, finding_images(count)'

export async function listFindings(
  filter: {
    projectId?: string
    taskId?: string
    authorId?: string
    status?: FindingStatus
    date?: string
  } = {},
): Promise<Finding[]> {
  // live_findings hides deleted findings and those of deleted projects.
  let query = supabase.from('live_findings').select(FINDING_COLUMNS).is('finding_images.deleted_at', null)
  if (filter.projectId) query = query.eq('project_id', filter.projectId)
  if (filter.taskId) query = query.eq('task_id', filter.taskId)
  if (filter.authorId) query = query.eq('author_id', filter.authorId)
  if (filter.status) query = query.eq('status', filter.status)
  if (filter.date) query = query.eq('finding_date', filter.date)
  const { data, error } = await query
    .order('finding_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw toDataError(error)
  return (data as FindingRow[]).map(toFinding)
}

export async function getFinding(id: string): Promise<FindingDetail> {
  const { data, error } = await supabase
    .from('live_findings')
    .select('*, images:finding_images(id, finding_id, storage_path, position, deleted_at, deleted_by)')
    .eq('id', id)
    .is('images.deleted_at', null)
    .order('position', { referencedTable: 'images' })
    .single()
  if (error) throw toDataError(error, { notFound: 'Finding not found' })

  const { images: imageRows, ...row } = data as FindingRow & { images: FindingImageRow[] }
  const urls = await signImagePaths(imageRows.map((r) => r.storage_path))
  return {
    ...toFinding({ ...row, finding_images: [{ count: imageRows.length }] }),
    images: imageRows.map((r) => toFindingImage(r, urls[r.storage_path])),
  }
}

/** Saves the finding first, then its screenshots. A failed upload never loses the finding. */
export async function createFinding(
  input: NewFinding,
  images: Blob[],
): Promise<{ finding: Finding; failedUploads: number }> {
  const { data, error } = await supabase.from('findings').insert(findingPatchToRow(input)).select('*').single()
  if (error) throw toDataError(error)
  const finding = toFinding(data as FindingRow)

  const { uploaded, failed } = await uploadFindingImages(finding.id, images, 0)
  return { finding: { ...finding, imageCount: uploaded.length }, failedUploads: failed }
}

export async function updateFinding(id: string, patch: Partial<NewFinding>): Promise<Finding> {
  const { data, error } = await supabase
    .from('findings')
    .update(findingPatchToRow(patch))
    .eq('id', id)
    .select(FINDING_COLUMNS)
    .is('finding_images.deleted_at', null)
    .single()
  if (error) throw toDataError(error, { notFound: 'Finding not found' })
  return toFinding(data as FindingRow)
}

/**
 * The only way to change a finding's status: a database function checks the move is allowed
 * and saves the optional comment in the same transaction (a refused move leaves no comment).
 */
export async function setFindingStatus(id: string, to: FindingStatus, comment?: string): Promise<void> {
  const { error } = await supabase.rpc('set_finding_status', { p_id: id, p_to: to, p_comment: comment ?? null })
  if (error) throw toDataError(error)
}

/** Hides the finding (soft delete). Its screenshots stay in storage so a restore is lossless. */
export const deleteFinding = (id: string): Promise<void> => softDelete('findings', id, 'Finding')

export const restoreFinding = (id: string): Promise<void> => restore('findings', id, 'Finding')
