import { useEffect, useId, useMemo, useState, type DragEvent } from 'react'
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_KINDS,
  attachmentMimeType,
  formatBytes,
  isCompressibleImage,
  isImage,
} from '../../data/attachmentRules'
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_TASK } from '../../data/limits'

interface AttachmentInputProps {
  /** Files picked but not yet uploaded. */
  value: File[]
  onChange: (files: File[]) => void
  /** Attachments already saved on the task (edit mode); they count toward the limit. */
  existingCount?: number
}

/** Why a file can't be attached, or null if it's fine. */
function rejectionFor(file: File): string | null {
  const mimeType = attachmentMimeType(file)
  if (!mimeType) return `“${file.name}” isn't allowed. Attach ${ATTACHMENT_KINDS}.`
  // Screenshots are compressed to well under the limit before upload, so only check the rest.
  if (!isCompressibleImage(mimeType) && file.size > MAX_ATTACHMENT_BYTES) {
    return `“${file.name}” is ${formatBytes(file.size)}. Max ${formatBytes(MAX_ATTACHMENT_BYTES)} per file.`
  }
  return null
}

/**
 * Collects screenshots and documents: Ctrl+V anywhere on the page, drag-and-drop, or a file picker.
 * Rejects disallowed types, oversized files and anything past the per-task limit with a visible message.
 */
export function AttachmentInput({ value, onChange, existingCount = 0 }: AttachmentInputProps) {
  const inputId = useId()
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  function addFiles(incoming: File[]) {
    if (incoming.length === 0) return
    const problems = incoming.map(rejectionFor).filter((p): p is string => p !== null)
    const allowed = incoming.filter((f) => rejectionFor(f) === null)
    const room = Math.max(0, MAX_ATTACHMENTS_PER_TASK - existingCount - value.length)
    const accepted = allowed.slice(0, room)

    if (allowed.length > room) setError(`Max ${MAX_ATTACHMENTS_PER_TASK} attachments per task`)
    else setError(problems[0] ?? null)

    if (accepted.length > 0) onChange([...value, ...accepted])
  }

  // Page-wide paste, so a fresh screenshot can be pasted without clicking a box first.
  // Text pastes carry no files, so typing/pasting into other fields is unaffected.
  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const files = Array.from(event.clipboardData?.files ?? [])
      if (files.length === 0) return
      event.preventDefault()
      addFiles(files)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  })

  // Thumbnails for images only: temporary in-memory URLs, released when the list changes or we unmount.
  const previews = useMemo(
    () => value.map((file) => (file.type.startsWith('image/') ? URL.createObjectURL(file) : null)),
    [value],
  )
  useEffect(() => () => previews.forEach((url) => url && URL.revokeObjectURL(url)), [previews])

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    addFiles(Array.from(event.dataTransfer.files))
  }

  function remove(index: number) {
    setError(null)
    onChange(value.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-2">
      <div
        data-testid="attachment-dropzone"
        onDragOver={(e) => {
          e.preventDefault() // required, or the browser opens the file instead of dropping it
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm transition ${
          dragging ? 'border-accent bg-accent-soft text-accent-fg' : 'border-line-strong bg-surface-2/50 text-fg-muted'
        }`}
      >
        <p aria-hidden="true" className="mb-1 text-2xl">
          📎
        </p>
        <p>
          Paste a screenshot (<kbd className="rounded border border-line bg-surface px-1 text-xs text-fg">Ctrl</kbd>+
          <kbd className="rounded border border-line bg-surface px-1 text-xs text-fg">V</kbd>), drop files here, or
        </p>
        <label htmlFor={inputId} className="cursor-pointer font-semibold text-accent-fg hover:underline">
          Add files
        </label>
        <input
          id={inputId}
          type="file"
          accept={ATTACHMENT_ACCEPT}
          multiple
          className="sr-only"
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []))
            e.target.value = '' // allow picking the same file again
          }}
        />
        <p className="mt-2 text-xs text-fg-subtle">
          {existingCount + value.length} / {MAX_ATTACHMENTS_PER_TASK} · {ATTACHMENT_KINDS} · max{' '}
          {formatBytes(MAX_ATTACHMENT_BYTES)} each
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm font-medium text-red-600">
          {error}
        </p>
      )}

      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map((file, index) => {
            const preview = previews[index]
            const mimeType = attachmentMimeType(file) ?? ''
            return (
              <li key={`${file.name}-${index}`} className="relative">
                {preview && isImage(mimeType) ? (
                  <img src={preview} alt={file.name} className="h-20 w-20 rounded-lg object-cover ring-1 ring-line" />
                ) : (
                  <FileChip name={file.name} size={file.size} />
                )}
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => remove(index)}
                  className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-accent text-xs text-white shadow ring-2 ring-white"
                >
                  ×
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** Compact name + size tile for a non-image file. */
export function FileChip({ name, size }: { name: string; size: number }) {
  return (
    <div className="flex h-20 w-44 flex-col justify-center gap-1 rounded-lg bg-surface-2 px-3 ring-1 ring-line">
      <span className="truncate text-sm font-medium text-fg" title={name}>
        📄 {name}
      </span>
      <span className="text-xs text-fg-muted">{formatBytes(size)}</span>
    </div>
  )
}
