import { supabase } from '../lib/supabase'
import { DataError, toDataError } from './errors'
import { SIGNED_URL_TTL_SECONDS } from './limits'
import { toFindingImage, type FindingImageRow } from './mappers'
import { softDelete } from './softDelete'
import type { FindingImage } from './types'

export { MAX_IMAGES_PER_FINDING, SIGNED_URL_TTL_SECONDS } from './limits'
export const FINDING_IMAGE_BUCKET = 'finding-images'

const EXTENSIONS: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' }

const bucket = () => supabase.storage.from(FINDING_IMAGE_BUCKET)

/**
 * Uploads screenshots one by one. Each upload is independent: a failure is counted
 * and the rest continue. A finding_images row is only written after its file exists,
 * so the DB never points at a missing file.
 */
export async function uploadFindingImages(
  findingId: string,
  images: Blob[],
  startPosition: number,
): Promise<{ uploaded: FindingImage[]; failed: number }> {
  const rows: FindingImageRow[] = []
  let failed = 0

  for (const [index, image] of images.entries()) {
    const extension = EXTENSIONS[image.type] ?? 'bin'
    const path = `findings/${findingId}/${crypto.randomUUID()}.${extension}`

    const { error: uploadError } = await bucket().upload(path, image, { contentType: image.type, upsert: false })
    if (uploadError) {
      failed++
      continue
    }

    const { data, error: rowError } = await supabase
      .from('finding_images')
      .insert({ finding_id: findingId, storage_path: path, position: startPosition + index })
      .select('id, finding_id, storage_path, position, deleted_at, deleted_by')
      .single()
    if (rowError) {
      failed++
      // The orphan file stays: storage has no delete policy, and nothing points at it.
      continue
    }
    rows.push(data as FindingImageRow)
  }

  const urls = await signImagePaths(rows.map((r) => r.storage_path))
  return { uploaded: rows.map((r) => toFindingImage(r, urls[r.storage_path])), failed }
}

/**
 * Screenshots for many findings at once (project page "Show details"): one query, one batch
 * of signed URLs, grouped by finding and ordered by position. Avoids one request per finding.
 */
export async function getFindingImagesFor(findingIds: string[]): Promise<Record<string, FindingImage[]>> {
  if (findingIds.length === 0) return {}
  const { data, error } = await supabase
    .from('finding_images')
    .select('id, finding_id, storage_path, position, deleted_at, deleted_by')
    .in('finding_id', findingIds)
    .is('deleted_at', null)
    .order('position')
  if (error) throw toDataError(error)

  const rows = data as FindingImageRow[]
  const urls = await signImagePaths(rows.map((r) => r.storage_path))
  const grouped: Record<string, FindingImage[]> = {}
  for (const row of rows) {
    ;(grouped[row.finding_id] ??= []).push(toFindingImage(row, urls[row.storage_path]))
  }
  return grouped
}

/** Hides one screenshot (soft delete). The file stays in storage so a restore is lossless. */
export const deleteFindingImage = (image: FindingImage): Promise<void> =>
  softDelete('finding_images', image.id, 'Screenshot')

/** Short-lived URLs for private files, keyed by storage path. */
export async function signImagePaths(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {}
  const { data, error } = await bucket().createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)
  if (error) throw new DataError('Could not load screenshots', error)
  const urls: Record<string, string> = {}
  for (const item of data) {
    if (item.path && item.signedUrl) urls[item.path] = item.signedUrl
  }
  return urls
}
