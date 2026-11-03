import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Avatar } from '../../components/Avatar'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { ErrorState } from '../../components/ErrorState'
import { LoadingState } from '../../components/LoadingState'
import { Markdown } from '../../components/Markdown'
import { StatusBadge } from '../../components/StatusBadge'
import { statusEdge, ui } from '../../components/ui'
import { needsReason, taskActionTarget, taskActions, type FindingAction, type TaskAction } from '../../domain/actions'
import { isOverdue, notStartedBy } from '../../domain/bucketTasks'
import { whoseTurnTask } from '../../domain/turn'
import { formatDateTime, formatDayHeading, todayInTeamTz } from '../../lib/dates'
import { useMe } from '../auth/useMe'
import { useFindings } from '../findings/queries'
import { StatusActions } from '../items/StatusActions'
import { Timeline } from '../items/Timeline'
import { useItemStatusMutation } from '../items/queries'
import { useProject } from '../projects/queries'
import { nameOf, useProfiles } from '../team/queries'
import { AttachmentList } from './AttachmentList'
import { ChecklistSection } from './ChecklistSection'
import { useDeleteTask, useTask, useTaskAttachments } from './queries'
import { TaskSubmission, type SubmissionMode } from './TaskSubmission'

/**
 * A task's own page, top to bottom in the order you read it:
 * what to do (title, details, brief files) → actions → what was done (submission) → findings → timeline.
 */
export function TaskDetailPage() {
  const { id = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  // Set by the task form when some attachments didn't upload (the task itself was saved).
  const navState = location.state as { failedUploads?: number; checklistError?: string | null } | null
  const failedUploads = navState?.failedUploads ?? 0
  const checklistError = navState?.checklistError ?? null
  const { me } = useMe()
  const task = useTask(id)
  const attachments = useTaskAttachments(id)
  const profiles = useProfiles()
  const projectId = task.data?.projectId ?? ''
  const project = useProject(projectId, { enabled: Boolean(projectId) })
  const findings = useFindings({ taskId: id })
  const setStatus = useItemStatusMutation()
  const deleteTask = useDeleteTask()
  const [submissionMode, setSubmissionMode] = useState<SubmissionMode | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (task.isPending) return <LoadingState />
  if (task.isError) return <ErrorState error={task.error} />

  const t = task.data
  const today = todayInTeamTz()
  const overdue = isOverdue(t, today)
  const assignee = nameOf(profiles.data, t.assignedTo)
  const allAttachments = attachments.data ?? []
  const brief = allAttachments.filter((a) => a.kind === 'brief')
  // Deliberately no "created" date: a task planned a week ahead should read as starting on its
  // start day, not as something that's been sitting there since it was typed up.
  const creator = nameOf(profiles.data, t.createdBy)

  // Don't guess whose turn it is before the team list is in: the buttons would jump to "More" and back.
  const turn = profiles.data ? whoseTurnTask(t, profiles.data) : []
  const waitingOn = turn.map((who) => nameOf(profiles.data, who)).join(', ')
  // "Mark done" opens the submission form below instead; hide the button while it's open.
  const actions = me && profiles.data ? taskActions(me, t).filter((a) => !(a === 'finish' && submissionMode)) : []
  const linkedFindings = findings.data ?? []

  const onRun = async (action: FindingAction | TaskAction, text?: string) => {
    const taskAction = action as TaskAction
    if (taskAction === 'finish') {
      // Finishing is a hand-in: the note and proof go together with the status move.
      setSubmissionMode('submit')
      return
    }
    // The refused-move message is shown by StatusActions; the mutation refetches the task either way.
    await setStatus.mutateAsync({
      type: 'task',
      id: t.id,
      to: taskActionTarget(taskAction, t),
      ...(needsReason(taskAction) ? { reason: text } : { comment: text }),
    })
  }

  async function moveToTrash() {
    setError(null)
    try {
      await deleteTask.mutateAsync(t.id)
      navigate(t.projectId ? `/projects/${t.projectId}` : '/tasks', { replace: true })
    } catch (err) {
      setConfirmingDelete(false)
      setError(err instanceof Error ? err.message : 'Could not move the task to Trash')
    }
  }

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      {failedUploads > 0 && (
        <p role="alert" className="rounded-lg border border-open-edge/40 bg-open-soft px-3 py-2.5 text-sm text-open">
          {failedUploads} attachment(s) failed to upload. Edit the task to retry.
        </p>
      )}
      {checklistError && (
        <p role="alert" className="rounded-lg border border-open-edge/40 bg-open-soft px-3 py-2.5 text-sm text-open">
          The checklist didn't save completely ({checklistError}). Edit the task to retry.
        </p>
      )}
      {error && <ErrorState error={new Error(error)} />}

      <header className={`${ui.card} space-y-3 p-5 ${statusEdge(t.status, overdue)}`}>
        {project.data && (
          <Link to={`/projects/${project.data.id}`} className="text-sm font-medium text-fg-muted hover:text-fg">
            {project.data.name}
          </Link>
        )}
        <h1 className={ui.pageTitle}>{t.title}</h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-fg-muted">
          <span className="flex items-center gap-2 font-semibold text-fg">
            <Avatar id={t.assignedTo} name={assignee} size="sm" />
            <span>{assignee}</span>
          </span>
          {t.deadline && (
            <span className={overdue ? 'font-medium text-overdue' : ''}>
              {overdue ? 'Overdue: due' : 'Due'} {formatDayHeading(t.deadline)}
            </span>
          )}
          <StatusBadge status={t.status} />
        </div>
        {t.status === 'blocked' && t.blockedReason && (
          <p className="text-sm font-medium text-overdue">Blocked because: {t.blockedReason}</p>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-fg-muted">
          <span>From {creator}</span>
          {t.startDate && (
            <span>
              {notStartedBy(t, today) ? 'Starts' : 'Started'} {formatDayHeading(t.startDate)}
            </span>
          )}
          {t.doneAt && <span>Finished {formatDateTime(t.doneAt)}</span>}
          {waitingOn && <span>Waiting on {waitingOn}</span>}
        </div>

        <div className="space-y-3 border-t border-line pt-4">
          {t.explanation && (
            <div>
              <h2 className={`${ui.sectionTitle} mb-1.5`}>Details</h2>
              {/* Markdown without raw HTML: pasted markup shows as text, never runs. */}
              <Markdown className="text-sm leading-relaxed text-fg">{t.explanation}</Markdown>
            </div>
          )}
          <ChecklistSection task={t} me={me} />
          {brief.length > 0 && (
            <div>
              <h2 className={`${ui.sectionTitle} mb-1.5`}>
                Attachments <span className="text-fg-muted">({brief.length})</span>
              </h2>
              <AttachmentList attachments={brief} task={t} me={me} />
            </div>
          )}
        </div>
        {attachments.isError && <ErrorState error={attachments.error} />}
      </header>

      <div className="flex flex-wrap items-start gap-2">
        <StatusActions actions={actions} primary={Boolean(me && turn.includes(me.id))} onRun={onRun} />
        <Link to={`/tasks/${t.id}/edit`} className={ui.btnSecondary}>
          Edit
        </Link>
        <button type="button" onClick={() => setConfirmingDelete(true)} className={ui.btnDangerGhost}>
          Delete
        </button>
      </div>

      {attachments.isSuccess && (
        <TaskSubmission
          task={t}
          me={me}
          attachments={allAttachments}
          mode={submissionMode}
          onModeChange={setSubmissionMode}
        />
      )}

      {findings.isError && <ErrorState error={findings.error} />}
      {linkedFindings.length > 0 && (
        <section aria-labelledby="task-findings-heading" className="space-y-2">
          <h2 id="task-findings-heading" className={ui.sectionTitle}>
            Findings from this task
          </h2>
          <ul className={`${ui.card} divide-y divide-line`}>
            {linkedFindings.map((finding) => (
              <li key={finding.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <Link to={`/findings/${finding.id}`} className="min-w-0 truncate text-sm font-medium text-fg hover:underline">
                  {finding.title}
                </Link>
                <StatusBadge status={finding.status} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <Timeline key={t.id} target={{ taskId: t.id }} deleted={t.deletedAt !== null} />

      <ConfirmDialog
        open={confirmingDelete}
        title="Move to Trash?"
        body={`“${t.title}” will be hidden for everyone. You can restore it from Trash.`}
        confirmLabel="Move to Trash"
        tone="primary"
        busy={deleteTask.isPending}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={moveToTrash}
      />
    </article>
  )
}
