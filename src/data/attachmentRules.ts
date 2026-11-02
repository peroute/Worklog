// Which files can be attached to a task. No imports, so UI components can use it freely.
//
// We decide the type from the file EXTENSION, not from `file.type`: browsers report types
// inconsistently (Windows says a .csv is 'application/vnd.ms-excel' and a .zip is
// 'application/x-zip-compressed'). Mapping extension → one canonical type keeps the client
// in step with the bucket's allowed_mime_types list in the task_attachments migration.

const TYPES_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  csv: 'text/csv',
  zip: 'application/zip',
}

/** Value for <input type="file" accept>, e.g. ".png,.jpg,…". Only a hint to the picker, not enforcement. */
export const ATTACHMENT_ACCEPT = Object.keys(TYPES_BY_EXTENSION)
  .map((ext) => `.${ext}`)
  .join(',')

/** Human-readable list for error messages. */
export const ATTACHMENT_KINDS = 'images, PDF, Word, Excel, PowerPoint, TXT, CSV or ZIP'

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase()
}

/**
 * Canonical type for an allowed file, or null if not allowed.
 * Pasted screenshots have no real name ("image.png"), so fall back to the browser's type for images.
 */
export function attachmentMimeType(file: { name: string; type: string }): string | null {
  const byExtension = TYPES_BY_EXTENSION[extensionOf(file.name)]
  if (byExtension) return byExtension
  return Object.values(TYPES_BY_EXTENSION).includes(file.type) && file.type.startsWith('image/') ? file.type : null
}

/** Screenshot-style images we re-encode to WebP to save space. GIFs are left alone (animation). */
export function isCompressibleImage(mimeType: string): boolean {
  return mimeType === 'image/png' || mimeType === 'image/jpeg' || mimeType === 'image/webp'
}

export function isImage(mimeType: string): boolean {
  return mimeType.startsWith('image/')
}

/** File extension to store under, e.g. 'image/webp' → 'webp'. */
export function extensionFor(mimeType: string): string {
  return Object.entries(TYPES_BY_EXTENSION).find(([, type]) => type === mimeType)?.[0] ?? 'bin'
}

/** 1234567 → "1.2 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
