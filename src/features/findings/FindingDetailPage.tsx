import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Avatar } from '../../components/Avatar'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { ErrorState } from '../../components/ErrorState'
import { LoadingState } from '../../components/LoadingState'
import { StatusBadge } from '../../components/StatusBadge'
import { ui } from '../../components/ui'
import { FINDING_ACTION_TARGET, findingActions, type FindingAction, type TaskAction } from '../../domain/actions'
import { whoseTurnFinding } from '../../domain/turn'
import { formatDayHeading } from '../../lib/dates'
import { useMe } from '../auth/useMe'
import { useProjects } from '../projects/queries'
import { useTasks } from '../tasks/queries'
import { nameOf, useProfiles } from '../team/queries'
import { StatusActions } from '../items/StatusActions'
import { Timeline } from '../items/Timeline'
import { useItemStatusMutation } from '../items/queries'
import { useDeleteFinding, useFinding } from './queries'
import { Markdown } from '../../components/Markdown'

export function FindingDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const failedUploads = (location.state as { failedUploads?: number } | null)?.failedUploads ?? 0

  const { me } = useMe()
  const finding = useFinding(id)
  const profiles = useProfiles()
  // Whose turn it is depends on the task's creator / the project's creator, so load both lists.
  const projects = useProjects()
  const tasks = useTasks({})
  const setStatus = useItemStatusMutation()
  const deleteFinding = useDeleteFinding()

  const [enlarged, setEnlarged] = useState<number | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  if (finding.isPending) return <LoadingState />
  if (finding.isError) return <ErrorState error={finding.error} />

  const f = finding.data
  const project = projects.data?.find((p) => p.id === f.projectId)
  const linkedTask = tasks.data?.find((t) => t.id === f.taskId)
  // Don't guess who's up before we know: the buttons would jump between "primary" and "More".
  const turnKnown = !projects.isPending && !tasks.isPending && !profiles.isPending
  const turn = turnKnown
    ? whoseTurnFinding(f, { tasks: tasks.data ?? [], projects: projects.data ?? [], profiles: profiles.data ?? [] })
    : []
  const actions = me && turnKnown ? findingActions(me, f) : []
  const waitingOn = turn.map((id) => nameOf(profiles.data, id)).join(', ')

  async function run(action: () => Promise<unknown>) {
    setActionError(null)
    try {
      await action()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  // The refused-move message is shown by StatusActions; the mutation refetches the finding either way.
  const onRun = async (action: FindingAction | TaskAction, text?: string) => {
    await setStatus.mutateAsync({
      type: 'finding',
      id: f.id,
      to: FINDING_ACTION_TARGET[action as FindingAction],
      comment: text,
    })
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
        {project && (
          <Link to={`/projects/${project.id}`} className="text-sm font-medium text-fg-muted hover:text-fg">
            {project.name}
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
          {linkedTask && <span className={ui.tag}>Task: {linkedTask.title}</span>}
        </div>
        {waitingOn && <p className="text-sm text-fg-muted">Waiting on {waitingOn}</p>}
      </header>

      <div className="flex flex-wrap items-start gap-2">
        {/* Only the moves that make sense for this status. Buttons when it's your turn, otherwise under More. */}
        <StatusActions actions={actions} primary={Boolean(me && turn.includes(me.id))} onRun={onRun} />
        <Link to={`/findings/${f.id}/edit`} className={ui.btnSecondary}>
          Edit
        </Link>
        <button type="button" onClick={() => setConfirmingDelete(true)} className={ui.btnDangerGhost}>
          Delete
        </button>
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

      <Timeline key={f.id} target={{ findingId: f.id }} deleted={f.deletedAt !== null} />

      <ConfirmDialog
        open={confirmingDelete}
        title="Move to Trash?"
        body={`“${f.title}” and its ${f.images.length} screenshot(s) will be hidden. You can restore it from Trash.`}
        confirmLabel="Move to Trash"
        tone="primary"
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
