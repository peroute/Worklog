import { useId } from 'react'
import { ErrorState } from '../../components/ErrorState'
import { ui } from '../../components/ui'
import { formatBytes, isImage } from '../../data/attachmentRules'
import { useTaskAttachments } from './queries'

/** Attachments section on a task's page. Renders nothing when the task has none. */
export function TaskAttachments({ taskId }: { taskId: string }) {
  const headingId = useId()
  const attachments = useTaskAttachments(taskId)

  if (attachments.isPending) return null // the rest of the page is already useful; don't flash a spinner
  if (attachments.isError) return <ErrorState error={attachments.error} />
  if (attachments.data.length === 0) return null

  const images = attachments.data.filter((a) => isImage(a.mimeType))
  const documents = attachments.data.filter((a) => !isImage(a.mimeType))

  return (
    <section aria-labelledby={headingId} className={`${ui.card} space-y-4 p-5`}>
      <h2 id={headingId} className={ui.sectionTitle}>
        Attachments <span className="text-fg-muted">({attachments.data.length})</span>
      </h2>

      {images.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((image) => (
            <li key={image.id}>
              {/* noopener: the new tab can't reach back into this page via window.opener */}
              <a
                href={image.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block overflow-hidden rounded-lg ring-1 ring-line hover:ring-accent"
              >
                <img src={image.url} alt={image.fileName} className="h-32 w-full object-cover" />
              </a>
            </li>
          ))}
        </ul>
      )}

      {documents.length > 0 && (
        <ul className="divide-y divide-line rounded-lg ring-1 ring-line">
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span aria-hidden="true">📄</span>
              <span className="min-w-0 flex-1 truncate font-medium text-fg" title={doc.fileName}>
                {doc.fileName}
              </span>
              <span className="text-xs text-fg-muted">{formatBytes(doc.sizeBytes)}</span>
              <a href={doc.url} className={ui.link} aria-label={`Download ${doc.fileName}`}>
                Download
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
