import { supabase } from '../lib/supabase'
import { extensionFor, isImage } from './attachmentRules'
import { DataError, toDataError } from './errors'
import { SIGNED_URL_TTL_SECONDS } from './limits'
import { toTaskAttachment, type TaskAttachmentRow } from './mappers'
import { softDelete } from './softDelete'
import type { AttachmentKind, TaskAttachment } from './types'

export const TASK_ATTACHMENT_BUCKET = 'task-attachments'

const COLUMNS = 'id, task_id, storage_path, file_name, mime_type, size_bytes, position, uploaded_by, kind, deleted_at, deleted_by'

const bucket = () => supabase.storage.from(TASK_ATTACHMENT_BUCKET)

/** A file ready to upload: already validated (and, for screenshots, compressed). */
export interface PendingAttachment {
  blob: Blob
  fileName: string
  mimeType: string
}

/**
 * Uploads attachments one by one; a failure is counted and the rest continue.
 * The DB row is written only after its file exists, so a row never points at nothing.
 * `kind`: 'brief' for the creator's files, 'proof' for the assignee's (just a label, anyone on the team may add either).
 */
export async function uploadTaskAttachments(
  taskId: string,
  items: PendingAttachment[],
  startPosition: number,
  kind: AttachmentKind = 'brief',
): Promise<{ uploaded: number; failed: number }> {
  let uploaded = 0
  let failed = 0

  for (const [index, item] of items.entries()) {
    const path = `tasks/${taskId}/${crypto.randomUUID()}.${extensionFor(item.mimeType)}`

    const { error: uploadError } = await bucket().upload(path, item.blob, { contentType: item.mimeType, upsert: false })
    if (uploadError) {
      failed++
      continue
    }

    // uploaded_by defaults to the logged-in user in the DB; sending it would only invite spoofing.
    const { error: rowError } = await supabase.from('task_attachments').insert({
      task_id: taskId,
      storage_path: path,
      file_name: item.fileName,
      mime_type: item.mimeType,
      size_bytes: item.blob.size,
      position: startPosition + index,
      kind,
    })
    if (rowError) {
      failed++
      // The orphan file stays: storage has no delete policy, and nothing points at it.
      continue
    }
    uploaded++
  }

  return { uploaded, failed }
}

/** A task's attachments in order, each with a fresh signed URL. */
export async function listTaskAttachments(taskId: string): Promise<TaskAttachment[]> {
  const { data, error } = await supabase
    .from('task_attachments')
    .select(COLUMNS)
    .eq('task_id', taskId)
    .is('deleted_at', null)
    .order('position')
  if (error) throw toDataError(error)

  const rows = data as TaskAttachmentRow[]
  const urls = await signAttachments(rows)
  return rows.map((r) => toTaskAttachment(r, urls[r.storage_path]))
}

/**
 * Images: one batch of plain signed URLs (shown inline as thumbnails).
 * Documents: one URL each with `download: <original name>`. Storage then sends
 * Content-Disposition: attachment, so the browser saves the file under its real name
 * instead of rendering it — a file mislabelled as a PDF can't run in the page.
 */
async function signAttachments(rows: TaskAttachmentRow[]): Promise<Record<string, string>> {
  const urls: Record<string, string> = {}
  const imagePaths = rows.filter((r) => isImage(r.mime_type)).map((r) => r.storage_path)
  const documents = rows.filter((r) => !isImage(r.mime_type))

  if (imagePaths.length > 0) {
    const { data, error } = await bucket().createSignedUrls(imagePaths, SIGNED_URL_TTL_SECONDS)
    if (error) throw new DataError('Could not load attachments', error)
    for (const item of data) {
      if (item.path && item.signedUrl) urls[item.path] = item.signedUrl
    }
  }

  const signed = await Promise.all(
    documents.map((r) =>
      bucket().createSignedUrl(r.storage_path, SIGNED_URL_TTL_SECONDS, { download: r.file_name }),
    ),
  )
  for (const [index, result] of signed.entries()) {
    if (result.error) throw new DataError('Could not load attachments', result.error)
    urls[documents[index].storage_path] = result.data.signedUrl
  }

  return urls
}

/** Hides one attachment (soft delete). The file stays in storage so a restore is lossless. */
export const deleteTaskAttachment = (attachment: TaskAttachment): Promise<void> =>
  softDelete('task_attachments', attachment.id, 'Attachment')
