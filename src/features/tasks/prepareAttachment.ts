import { attachmentMimeType, extensionFor, isCompressibleImage } from '../../data/attachmentRules'
import type { PendingAttachment } from '../../data/taskAttachments'
import { compressScreenshot } from '../findings/compress'

/**
 * Turns a picked file into something ready to upload.
 * Screenshots (PNG/JPEG/WebP) are re-encoded small, like finding screenshots, and their name's
 * extension is updated to match. Documents and GIFs go up byte-for-byte.
 * Assumes the file already passed AttachmentInput's checks.
 */
export async function prepareAttachment(file: File): Promise<PendingAttachment> {
  const mimeType = attachmentMimeType(file)
  if (!mimeType) throw new Error(`“${file.name}” is not an allowed file type`)

  if (!isCompressibleImage(mimeType)) return { blob: file, fileName: file.name, mimeType }

  const blob = await compressScreenshot(file)
  const base = file.name.replace(/\.[^.]+$/, '') || 'screenshot'
  return { blob, fileName: `${base}.${extensionFor(blob.type)}`, mimeType: blob.type }
}
