import { useState } from 'react'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { RemoveBadge } from '../../components/FileDropzone'
import { ui } from '../../components/ui'
import { formatBytes, isImage } from '../../data/attachmentRules'
import type { Profile, Task, TaskAttachment } from '../../data/types'
import { nameOf, useProfiles } from '../team/queries'
import { useRemoveTaskAttachment } from './queries'

interface AttachmentListProps {
  attachments: TaskAttachment[]
  /** Kept so callers don't change; every file is removable by everyone now. */
  task?: Task
  me: Profile | undefined
  /** Show "Added by …" under each file (useful when several people add to the same list). */
  showUploader?: boolean
}

/**
 * Saved task files: images as thumbnails, documents as download rows.
 * Each file has a remove button for everyone on the team (asks first).
 * Used for both the brief (in the task header) and the proof (in the submission).
 */
export function AttachmentList({ attachments, me, showUploader = false }: AttachmentListProps) {
  const profiles = useProfiles()
  const removeAttachment = useRemoveTaskAttachment()
  const [confirmRemove, setConfirmRemove] = useState<TaskAttachment | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (attachments.length === 0) return null

  const images = attachments.filter((a) => isImage(a.mimeType))
  const documents = attachments.filter((a) => !isImage(a.mimeType))
  const addedBy = (a: TaskAttachment) => `Added by ${a.uploadedBy === me?.id ? 'you' : nameOf(profiles.data, a.uploadedBy)}`

  async function remove(attachment: TaskAttachment) {
    setError(null)
    try {
      await removeAttachment.mutateAsync(attachment)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the attachment')
    } finally {
      setConfirmRemove(null)
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="text-sm font-medium text-overdue">
          {error}
        </p>
      )}

      {images.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((image) => (
            <li key={image.id} className="relative">
              {/* noopener: the new tab can't reach back into this page via window.opener */}
              <a
                href={image.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block overflow-hidden rounded-lg ring-1 ring-line hover:ring-accent"
              >
                <img src={image.url} alt={image.fileName} className="h-32 w-full object-cover" />
              </a>
              {showUploader && <p className="mt-1 truncate text-xs text-fg-muted">{addedBy(image)}</p>}
              <RemoveBadge label={`Remove ${image.fileName}`} onClick={() => setConfirmRemove(image)} />
            </li>
          ))}
        </ul>
      )}

      {documents.length > 0 && (
        <ul className="divide-y divide-line rounded-lg ring-1 ring-line">
          {documents.map((doc) => (
            <li key={doc.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
              <span aria-hidden="true">📄</span>
              <span className="min-w-0 flex-1 truncate font-medium text-fg" title={doc.fileName}>
                {doc.fileName}
              </span>
              <span className="text-xs text-fg-muted">
                {formatBytes(doc.sizeBytes)}
                {showUploader && ` · ${addedBy(doc)}`}
              </span>
              <a href={doc.url} className={ui.link} aria-label={`Download ${doc.fileName}`}>
                Download
              </a>
              <button
                type="button"
                onClick={() => setConfirmRemove(doc)}
                className="text-xs font-medium text-overdue hover:underline"
                aria-label={`Remove ${doc.fileName}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={confirmRemove !== null}
        title={`Remove “${confirmRemove?.fileName ?? ''}”?`}
        body="The file moves to Trash for everyone."
        confirmLabel="Remove"
        busy={removeAttachment.isPending}
        onConfirm={() => confirmRemove && remove(confirmRemove)}
        onCancel={() => setConfirmRemove(null)}
      />
    </div>
  )
}
