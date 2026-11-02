import { useId, useState } from 'react'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { ErrorState } from '../../components/ErrorState'
import { RemoveBadge } from '../../components/FileDropzone'
import { ui } from '../../components/ui'
import { formatBytes, isImage } from '../../data/attachmentRules'
import type { Profile, Task, TaskAttachment } from '../../data/types'
import { canAttachToTask, canRemoveTaskAttachment } from '../../domain/permissions'
import { nameOf, useProfiles } from '../team/queries'
import { AttachmentInput } from './AttachmentInput'
import { useAddTaskAttachments, useRemoveTaskAttachment, useTaskAttachments } from './queries'

interface TaskAttachmentsProps {
  task: Task
  me: Profile | undefined
}

/**
 * Attachments section on a task's page: the brief from the creator and, optionally, proof of
 * work from the assignee. Anyone allowed can add files here without opening the edit form.
 * Renders nothing when there are no attachments and `me` can't add any.
 */
export function TaskAttachments({ task, me }: TaskAttachmentsProps) {
  const headingId = useId()
  const attachments = useTaskAttachments(task.id)
  const profiles = useProfiles()
  const addAttachments = useAddTaskAttachments(task.id)
  const removeAttachment = useRemoveTaskAttachment()

  const [adding, setAdding] = useState(false)
  const [pending, setPending] = useState<File[]>([])
  const [confirmRemove, setConfirmRemove] = useState<TaskAttachment | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (attachments.isPending) return null // the rest of the page is already useful; don't flash a spinner
  if (attachments.isError) return <ErrorState error={attachments.error} />

  const all = attachments.data
  const canAdd = me ? canAttachToTask(me, task) : false
  const canRemove = (a: TaskAttachment) => (me ? canRemoveTaskAttachment(me, task, a) : false)
  if (all.length === 0 && !canAdd) return null

  const images = all.filter((a) => isImage(a.mimeType))
  const documents = all.filter((a) => !isImage(a.mimeType))
  const addedBy = (a: TaskAttachment) => `Added by ${a.uploadedBy === me?.id ? 'you' : nameOf(profiles.data, a.uploadedBy)}`

  function closeAdder() {
    setAdding(false)
    setPending([])
  }

  async function upload() {
    setError(null)
    try {
      const { failed } = await addAttachments.mutateAsync({
        files: pending,
        startPosition: Math.max(-1, ...all.map((a) => a.position)) + 1,
      })
      closeAdder()
      if (failed > 0) setError(`${failed} file(s) failed to upload. Try adding them again.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload the files')
    }
  }

  async function remove(attachment: TaskAttachment) {
    setError(null)
    try {
      await removeAttachment.mutateAsync(attachment)
      setConfirmRemove(null)
    } catch (err) {
      setConfirmRemove(null)
      setError(err instanceof Error ? err.message : 'Could not remove the attachment')
    }
  }

  return (
    <section aria-labelledby={headingId} className={`${ui.card} space-y-4 p-5`}>
      <div className="flex items-center gap-2">
        <h2 id={headingId} className={ui.sectionTitle}>
          Attachments <span className="text-fg-muted">({all.length})</span>
        </h2>
        {canAdd && !adding && (
          <button type="button" onClick={() => setAdding(true)} className={`${ui.btnSecondary} ml-auto`}>
            {me?.id === task.assignedTo ? 'Add proof of work' : 'Attach files'}
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm font-medium text-red-600">
          {error}
        </p>
      )}

      {all.length === 0 && !adding && (
        <p className="text-sm text-fg-muted">
          {me?.id === task.assignedTo
            ? 'Optional: attach screenshots or files showing the work is done.'
            : 'No attachments yet.'}
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
              <p className="mt-1 truncate text-xs text-fg-muted">{addedBy(image)}</p>
              {canRemove(image) && (
                <RemoveBadge label={`Remove ${image.fileName}`} onClick={() => setConfirmRemove(image)} />
              )}
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
                {formatBytes(doc.sizeBytes)} · {addedBy(doc)}
              </span>
              <a href={doc.url} className={ui.link} aria-label={`Download ${doc.fileName}`}>
                Download
              </a>
              {canRemove(doc) && (
                <button
                  type="button"
                  onClick={() => setConfirmRemove(doc)}
                  className="text-xs font-medium text-overdue hover:underline"
                  aria-label={`Remove ${doc.fileName}`}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <div className="space-y-3">
          <AttachmentInput value={pending} onChange={setPending} existingCount={all.length} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={closeAdder} className={ui.btnSecondary}>
              Cancel
            </button>
            <button
              type="button"
              onClick={upload}
              disabled={pending.length === 0 || addAttachments.isPending}
              className={ui.btnPrimary}
            >
              {addAttachments.isPending ? 'Uploading…' : `Upload ${pending.length || ''}`.trim()}
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmRemove !== null}
        title={`Remove “${confirmRemove?.fileName ?? ''}”?`}
        body="The file is deleted for everyone. This cannot be undone."
        confirmLabel="Remove"
        busy={removeAttachment.isPending}
        onConfirm={() => confirmRemove && remove(confirmRemove)}
        onCancel={() => setConfirmRemove(null)}
      />
    </section>
  )
}
