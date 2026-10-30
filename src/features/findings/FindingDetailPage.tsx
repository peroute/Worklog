import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { ErrorState } from '../../components/ErrorState'
import { LoadingState } from '../../components/LoadingState'
import { StatusBadge } from '../../components/StatusBadge'
import { canEditContent } from '../../domain/permissions'
import { formatDayHeading } from '../../lib/dates'
import { useMe } from '../auth/useMe'
import { useProject } from '../projects/queries'
import { useTasks } from '../tasks/queries'
import { nameOf, useProfiles } from '../team/queries'
import { useDeleteFinding, useFinding, useSetFindingStatus } from './queries'

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

  const [enlarged, setEnlarged] = useState<number | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  if (finding.isPending) return <LoadingState />
  if (finding.isError) return <ErrorState error={finding.error} />

  const f = finding.data
  const linkedTask = tasks.data?.find((t) => t.id === f.taskId)
  const canEdit = me ? canEditContent(me, f.authorId) : false

  async function run(action: () => Promise<unknown>) {
    setActionError(null)
    try {
      await action()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  return (
    <article className="mx-auto max-w-3xl space-y-4">
      {failedUploads > 0 && (
        <p role="alert" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          {failedUploads} screenshot(s) failed to upload — edit the finding to retry.
        </p>
      )}
      {actionError && <ErrorState error={new Error(actionError)} />}

      <header className="space-y-1">
        {project.data && (
          <Link to={`/projects/${project.data.id}`} className="text-sm text-blue-600 hover:underline">
            {project.data.name}
          </Link>
        )}
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-xl font-semibold">{f.title}</h1>
          <StatusBadge status={f.status} />
        </div>
        <p className="text-sm text-gray-600">
          <span>{nameOf(profiles.data, f.authorId)}</span> · {formatDayHeading(f.findingDate)}
          {linkedTask && <> · Task: {linkedTask.title}</>}
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={setStatus.isPending}
          onClick={() => run(() => setStatus.mutateAsync({ id: f.id, status: f.status === 'open' ? 'closed' : 'open' }))}
          className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-60"
        >
          {f.status === 'open' ? 'Mark closed' : 'Reopen'}
        </button>
        {canEdit && (
          <>
            <Link to={`/findings/${f.id}/edit`} className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50">
              Edit
            </Link>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="rounded border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          </>
        )}
      </div>

      {/* Plain text only: React escapes it, so pasted HTML shows as text, never as markup. */}
      <p className="rounded-lg border bg-white p-4 text-sm whitespace-pre-wrap">{f.explanation}</p>

      {f.images.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {f.images.map((image, index) => (
            <li key={image.id}>
              <button
                type="button"
                aria-label={`Open screenshot ${index + 1}`}
                onClick={() => setEnlarged(index)}
                className="block w-full overflow-hidden rounded border bg-white"
              >
                <img src={image.url} alt="" className="h-40 w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {enlarged !== null && f.images[enlarged] && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Screenshot ${enlarged + 1}`}
          onClick={() => setEnlarged(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        >
          <img src={f.images[enlarged].url} alt={`Screenshot ${enlarged + 1}`} className="max-h-full max-w-full rounded" />
          <button type="button" onClick={() => setEnlarged(null)} className="absolute top-4 right-4 rounded bg-white px-3 py-1 text-sm">
            Close
          </button>
        </div>
      )}

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
