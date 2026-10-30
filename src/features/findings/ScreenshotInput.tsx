import { useEffect, useId, useMemo, useState, type DragEvent } from 'react'
import { MAX_IMAGES_PER_FINDING } from '../../data/limits'

interface ScreenshotInputProps {
  /** Screenshots picked but not yet uploaded. */
  value: File[]
  onChange: (files: File[]) => void
  /** Screenshots already saved on the finding (edit mode); they count toward the limit. */
  existingCount?: number
}

/**
 * Collects screenshots three ways: Ctrl+V anywhere on the page, drag-and-drop, or a file picker.
 * Rejects non-images and anything past the per-finding limit with a visible message.
 */
export function ScreenshotInput({ value, onChange, existingCount = 0 }: ScreenshotInputProps) {
  const inputId = useId()
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  function addFiles(incoming: File[]) {
    if (incoming.length === 0) return
    const images = incoming.filter((f) => f.type.startsWith('image/'))
    const room = Math.max(0, MAX_IMAGES_PER_FINDING - existingCount - value.length)
    const accepted = images.slice(0, room)

    if (images.length > room) setError(`Max ${MAX_IMAGES_PER_FINDING} screenshots per finding`)
    else if (images.length < incoming.length) setError('Only images can be attached')
    else setError(null)

    if (accepted.length > 0) onChange([...value, ...accepted])
  }

  // Page-wide paste: a fresh screenshot can be pasted without clicking into a box first.
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

  // Thumbnails: temporary in-memory URLs, released when the list changes or we unmount.
  const previews = useMemo(() => value.map((file) => URL.createObjectURL(file)), [value])
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews])

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    addFiles(Array.from(event.dataTransfer.files))
  }

  return (
    <div className="space-y-2">
      <div
        data-testid="screenshot-dropzone"
        onDragOver={(e) => {
          e.preventDefault() // required, or the browser opens the image instead of dropping it
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-lg border-2 border-dashed p-4 text-center text-sm ${
          dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 text-gray-600'
        }`}
      >
        <p>Paste a screenshot (Ctrl+V), drop images here, or</p>
        <label htmlFor={inputId} className="cursor-pointer font-medium text-blue-600 hover:underline">
          Add screenshots
        </label>
        <input
          id={inputId}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []))
            e.target.value = '' // allow picking the same file again
          }}
        />
        <p className="mt-1 text-xs text-gray-500">
          {existingCount + value.length} / {MAX_IMAGES_PER_FINDING}
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map((file, index) => (
            <li key={previews[index]} className="relative">
              <img src={previews[index]} alt={file.name} className="h-20 w-20 rounded object-cover" />
              <button
                type="button"
                aria-label={`Remove screenshot ${index + 1}`}
                onClick={() => {
                  setError(null)
                  onChange(value.filter((_, i) => i !== index))
                }}
                className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-gray-800 text-xs text-white"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
