import { supabase } from '../lib/supabase'
import { DataError, toDataError } from './errors'
import { listImagePaths, removeStoredFiles, signImagePaths, uploadFindingImages } from './images'
import { findingPatchToRow, toFinding, toFindingImage, type FindingImageRow, type FindingRow } from './mappers'
import type { Finding, FindingDetail, FindingStatus, NewFinding } from './types'

// Every finding query also asks for its screenshot count.
const FINDING_COLUMNS = '*, finding_images(count)'

export async function listFindings(
  filter: { projectId?: string; authorId?: string; status?: FindingStatus; date?: string } = {},
): Promise<Finding[]> {
  let query = supabase.from('findings').select(FINDING_COLUMNS)
  if (filter.projectId) query = query.eq('project_id', filter.projectId)
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
    .from('findings')
    .select('*, images:finding_images(id, finding_id, storage_path, position)')
    .eq('id', id)
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
    .single()
  if (error) throw toDataError(error, { notFound: 'Finding not found' })
  return toFinding(data as FindingRow)
}

export async function setFindingStatus(id: string, status: FindingStatus): Promise<Finding> {
  const { data, error } = await supabase.from('findings').update({ status }).eq('id', id).select(FINDING_COLUMNS).single()
  if (error) throw toDataError(error, { notFound: 'Finding not found' })
  return toFinding(data as FindingRow)
}

/** Same order as deleteProject: paths → rows (permission check) → files. */
export async function deleteFinding(id: string): Promise<void> {
  const paths = await listImagePaths([id])
  const { data, error } = await supabase.from('findings').delete().eq('id', id).select('id')
  if (error) throw toDataError(error)
  if (!data || data.length === 0) throw new DataError('Only the author or lead can delete this finding')
  await removeStoredFiles(paths)
}
