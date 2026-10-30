import { supabase } from '../lib/supabase'
import { DataError, toDataError } from './errors'
import { SIGNED_URL_TTL_SECONDS } from './limits'
import { toFindingImage, type FindingImageRow } from './mappers'
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
      .select('id, finding_id, storage_path, position')
      .single()
    if (rowError) {
      failed++
      await bucket().remove([path]) // don't leave a file nobody can see
      continue
    }
    rows.push(data as FindingImageRow)
  }

  const urls = await signImagePaths(rows.map((r) => r.storage_path))
  return { uploaded: rows.map((r) => toFindingImage(r, urls[r.storage_path])), failed }
}

/** Removes one screenshot: DB row first (permission check), then the file. */
export async function deleteFindingImage(image: FindingImage): Promise<void> {
  const { data, error } = await supabase.from('finding_images').delete().eq('id', image.id).select('id')
  if (error) throw toDataError(error)
  if (!data || data.length === 0) throw new DataError('Only the author or lead can remove this screenshot')
  await removeStoredFiles([image.storagePath])
}

/** Storage paths of every screenshot attached to the given findings. */
export async function listImagePaths(findingIds: string[]): Promise<string[]> {
  if (findingIds.length === 0) return []
  const { data, error } = await supabase.from('finding_images').select('storage_path').in('finding_id', findingIds)
  if (error) throw toDataError(error)
  return (data as { storage_path: string }[]).map((r) => r.storage_path)
}

/** Deletes files from storage. Call only AFTER their DB rows are gone (see storage migration). */
export async function removeStoredFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  const { error } = await bucket().remove(paths)
  if (error) throw new DataError('Deleted, but some screenshot files could not be cleaned up', error)
}

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
