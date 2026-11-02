import { useEffect, useId, useMemo, useState, type DragEvent } from 'react'
import { formatBytes } from '../data/attachmentRules'

export interface FileDropzoneProps {
  /** Files picked but not yet uploaded. */
  value: File[]
  onChange: (files: File[]) => void
  /** Files already saved on the item (edit mode); they count toward `max`. */
  existingCount?: number
  max: number
  /** Why a file can't be added, or null if it's fine. Runs on every pasted/dropped/picked file. */
  validate: (file: File) => string | null
  /** Shown when more files arrive than there's room for. */
  tooManyMessage: string
  /** Hint for the file picker (e.g. "image/*"). Drag-and-drop and paste ignore it, so `validate` must enforce. */
  accept: string
  /** Text of the picker link, also the input's accessible name (e.g. "Add files"). */
  pickLabel: string
  /** What can be dropped, e.g. "images" → "drop images here". */
  dropNoun: string
  icon: string
  /** Extra line under the counter (allowed types, size limit…). */
  hint?: string
  /** Accessible name for a pending file's × button. */
  removeLabel: (file: File, index: number) => string
  testId?: string
}

/**
 * Collects files three ways: Ctrl+V anywhere on the page, drag-and-drop, or a file picker.
 * The caller decides what's allowed via `validate`; this handles the mechanics, the limit,
 * previews and error messages. Used by finding screenshots and task attachments.
 */
export function FileDropzone({
  value,
  onChange,
  existingCount = 0,
  max,
  validate,
  tooManyMessage,
  accept,
  pickLabel,
  dropNoun,
  icon,
  hint,
  removeLabel,
  testId,
}: FileDropzoneProps) {
  const inputId = useId()
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  function addFiles(incoming: File[]) {
    if (incoming.length === 0) return
    const problems = incoming.map(validate)
    const allowed = incoming.filter((_, i) => problems[i] === null)
    const room = Math.max(0, max - existingCount - value.length)
    const accepted = allowed.slice(0, room)

    if (allowed.length > room) setError(tooManyMessage)
    else setError(problems.find((p) => p !== null) ?? null)

    if (accepted.length > 0) onChange([...value, ...accepted])
  }

  // Page-wide paste: a fresh screenshot can be pasted without clicking into a box first.
  // Text pastes carry no files, so typing/pasting into other fields is unaffected.
  // Re-subscribed every render (no deps) so the handler always sees the current `value`.
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

  // Thumbnails for images: temporary in-memory URLs, released when the list changes or we unmount.
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

  return (
    <div className="space-y-2">
      <div
        data-testid={testId}
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
          {icon}
        </p>
        <p>
          Paste a screenshot (<kbd className="rounded border border-line bg-surface px-1 text-xs text-fg">Ctrl</kbd>+
          <kbd className="rounded border border-line bg-surface px-1 text-xs text-fg">V</kbd>), drop {dropNoun} here, or
        </p>
        <label htmlFor={inputId} className="cursor-pointer font-semibold text-accent-fg hover:underline">
          {pickLabel}
        </label>
        <input
          id={inputId}
          type="file"
          accept={accept}
          multiple
          className="sr-only"
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []))
            e.target.value = '' // allow picking the same file again
          }}
        />
        <p className="mt-2 text-xs text-fg-subtle">
          {existingCount + value.length} / {max}
          {hint && <> · {hint}</>}
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm font-medium text-red-600">
          {error}
        </p>
      )}

      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map((file, index) => (
            <li key={`${file.name}-${index}`} className="relative">
              {previews[index] ? (
                <img
                  src={previews[index]}
                  alt={file.name}
                  className="h-20 w-20 rounded-lg object-cover ring-1 ring-line"
                />
              ) : (
                <FileChip name={file.name} size={file.size} />
              )}
              <RemoveBadge
                label={removeLabel(file, index)}
                onClick={() => {
                  setError(null)
                  onChange(value.filter((_, i) => i !== index))
                }}
              />
            </li>
          ))}
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

/** The round × in the corner of a thumbnail or file tile. */
export function RemoveBadge({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-accent text-xs text-white shadow ring-2 ring-white"
    >
      ×
    </button>
  )
}
