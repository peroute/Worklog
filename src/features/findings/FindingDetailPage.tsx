import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Avatar } from '../../components/Avatar'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { ErrorState } from '../../components/ErrorState'
import { LoadingState } from '../../components/LoadingState'
import { StatusBadge } from '../../components/StatusBadge'
import { ui } from '../../components/ui'
import { canComment, canEditContent, findingActions } from '../../domain/permissions'
import { formatDayHeading } from '../../lib/dates'
import { useMe } from '../auth/useMe'
import { useProject } from '../projects/queries'
import { useTasks } from '../tasks/queries'
import { nameOf, useProfiles } from '../team/queries'
import { CommentThread } from '../comments/CommentThread'
import { RequestChangesDialog } from '../review/RequestChangesDialog'
import { useDeleteFinding, useFinding, useRequestChangesFinding, useSetFindingStatus } from './queries'
import { Markdown } from '../../components/Markdown'

export function FindingDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const failedUploads = (location.state as { failedUploads?: number } | null)?.failedUploads ?? 0

  const { me } = useMe()
  const finding = useFinding(id)
  const profiles = useProfiles()
  const projectId = finding.data?.projectId ?? ''
  const project = useProject(projectId, { enabled: Boolean(projectId) })
  const tasks = useTasks({ projectId }, { enabled: Boolean(finding.data?.taskId) })
  const setStatus = useSetFindingStatus()
  const deleteFinding = useDeleteFinding()
  const requestChanges = useRequestChangesFinding()
  const [requestingChanges, setRequestingChanges] = useState(false)

  const [enlarged, setEnlarged] = useState<number | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  if (finding.isPending) return <LoadingState />
  if (finding.isError) return <ErrorState error={finding.error} />

  const f = finding.data
  const linkedTask = tasks.data?.find((t) => t.id === f.taskId)
  // Approved work is frozen for the author; only the lead can still edit it.
  const canEdit = me ? canEditContent(me, f.authorId, f.status === 'approved') : false
  const actions = me ? findingActions(me, f) : []
  const setTo = (status: typeof f.status) => run(() => setStatus.mutateAsync({ id: f.id, status }))

  async function run(action: () => Promise<unknown>) {
    setActionError(null)
    try {
      await action()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      {failedUploads > 0 && (
        <p role="alert" className="rounded-lg border border-open-edge/40 bg-open-soft px-3 py-2.5 text-sm text-open">
          {failedUploads} screenshot(s) failed to upload — edit the finding to retry.
        </p>
      )}
      {actionError && <ErrorState error={new Error(actionError)} />}

      <header className="space-y-3">
        {project.data && (
          <Link to={`/projects/${project.data.id}`} className="text-sm font-medium text-fg-muted hover:text-fg">
            {project.data.name}
          </Link>
        )}
        <h1 className={ui.pageTitle}>{f.title}</h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-fg-muted">
          <span className="flex items-center gap-2 font-semibold text-fg">
            <Avatar id={f.authorId} name={nameOf(profiles.data, f.authorId)} size="sm" />
            <span>{nameOf(profiles.data, f.authorId)}</span>
          </span>
          <span>Logged {formatDayHeading(f.findingDate)}</span>
          <StatusBadge status={f.status} />
          {linkedTask && (
            <>
              <span className={ui.tag}>Task: {linkedTask.title}</span>
            </>
          )}
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {/* Only the buttons this person may use right now (mirrors the DB rules). */}
        {actions.includes('approve') && (
          <button
            type="button"
            disabled={setStatus.isPending}
            onClick={() => setTo('approved')}
            className={ui.btnPrimary}
          >
            Approve
          </button>
        )}
        {actions.includes('requestChanges') && (
          <button type="button" onClick={() => setRequestingChanges(true)} className={ui.btnSecondary}>
            Request changes
          </button>
        )}
        {actions.includes('resubmit') && (
          <button type="button" disabled={setStatus.isPending} onClick={() => setTo('resubmitted')} className={ui.btnPrimary}>
            Resubmit
          </button>
        )}
        {actions.includes('reopen') && (
          <button
            type="button"
            disabled={setStatus.isPending}
            onClick={() => setTo('submitted')}
            className={ui.btnSecondary}
          >
            Reopen
          </button>
        )}
        {canEdit && (
          <>
            <Link to={`/findings/${f.id}/edit`} className={ui.btnSecondary}>
              Edit
            </Link>
            <button type="button" onClick={() => setConfirmingDelete(true)} className={ui.btnDangerGhost}>
              Delete
            </button>
          </>
        )}
      </div>

      {/* Plain text only: React escapes it, so pasted HTML shows as text, never as markup. */}
      <Markdown className={`${ui.card} p-5 text-sm leading-relaxed text-fg`}>{f.explanation}</Markdown>

      {f.images.length > 0 && (
        <section aria-labelledby="evidence-heading" className="space-y-3">
          <h2 id="evidence-heading" className="text-lg font-semibold">
            Evidence <span className="text-fg-muted">({f.images.length})</span>
          </h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {f.images.map((image, index) => (
              <li key={image.id}>
                <button
                  type="button"
                  aria-label={`Open screenshot ${index + 1}`}
                  onClick={() => setEnlarged(index)}
                  className="block w-full overflow-hidden rounded-lg border border-line bg-surface-2 transition hover:border-accent"
                >
                  <img src={image.url} alt="" className="h-40 w-full object-cover" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {enlarged !== null && f.images[enlarged] && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Screenshot ${enlarged + 1}`}
          onClick={() => setEnlarged(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-accent/90 p-4"
        >
          <img
            src={f.images[enlarged].url}
            alt={`Screenshot ${enlarged + 1}`}
            className="max-h-full max-w-full rounded-lg shadow-2xl"
          />
          <button
            type="button"
            onClick={() => setEnlarged(null)}
            className="absolute top-4 right-4 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 shadow"
          >
            Close
          </button>
        </div>
      )}

      <CommentThread
        target={{ findingId: f.id }}
        canComment={me ? canComment(me, { kind: 'finding', authorId: f.authorId }) : false}
      />

      <RequestChangesDialog
        open={requestingChanges}
        itemTitle={f.title}
        onCancel={() => setRequestingChanges(false)}
        onSubmit={async (body) => {
          await requestChanges.mutateAsync({ id: f.id, body })
          setRequestingChanges(false)
        }}
      />

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete this finding?"
        body={`This deletes “${f.title}” and its ${f.images.length} screenshot(s). This cannot be undone.`}
        confirmLabel="Delete finding"
        busy={deleteFinding.isPending}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() =>
          run(async () => {
            await deleteFinding.mutateAsync(f.id)
            navigate(`/projects/${f.projectId}`, { replace: true })
          })
        }
      />
    </article>
  )
}
