import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { Avatar } from '../../components/Avatar'
import { ErrorState } from '../../components/ErrorState'
import { LoadingState } from '../../components/LoadingState'
import { StatusBadge } from '../../components/StatusBadge'
import { statusEdge, ui } from '../../components/ui'
import type { TaskStatus } from '../../data/types'
import { isOverdue, notStartedBy } from '../../domain/bucketTasks'
import { canComment, canEditChecklist, canEditContent, taskActions, type TaskAction } from '../../domain/permissions'
import { formatDateTime, formatDayHeading, todayInTeamTz } from '../../lib/dates'
import { useMe } from '../auth/useMe'
import { CommentThread } from '../comments/CommentThread'
import { useProject } from '../projects/queries'
import { RequestChangesDialog } from '../review/RequestChangesDialog'
import { nameOf, useProfiles } from '../team/queries'
import { Markdown } from '../../components/Markdown'
import { AttachmentList } from './AttachmentList'
import { ChecklistSection } from './ChecklistSection'
import { useRequestChangesTask, useSetTaskStatus, useTask, useTaskAttachments } from './queries'
import { TaskSubmission, type SubmissionMode } from './TaskSubmission'

type DirectAction = Exclude<TaskAction, 'requestChanges' | 'markDone' | 'resubmit'>

// Button label + target status for actions that change the status in one click.
const ACTIONS: Record<DirectAction, { label: string; to: TaskStatus; primary: boolean }> = {
  undoDone: { label: 'Withdraw submission', to: 'todo', primary: false },
  approve: { label: 'Approve', to: 'approved', primary: true },
  reopen: { label: 'Reopen', to: 'todo', primary: false },
}

// Handing work in opens the submission form (note + proof) instead of flipping the status blindly.
const SUBMIT_ACTIONS: Partial<Record<TaskAction, { label: string; mode: SubmissionMode }>> = {
  markDone: { label: 'Submit work', mode: 'submit' },
  resubmit: { label: 'Resubmit', mode: 'resubmit' },
}

/**
 * A task's own page, top to bottom in the order you read it:
 * what to do (title, details, brief files) → actions → what was done (submission) → discussion.
 */
export function TaskDetailPage() {
  const { id = '' } = useParams()
  const location = useLocation()
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
  const setStatus = useSetTaskStatus()
  const requestChanges = useRequestChangesTask()
  const [requestingChanges, setRequestingChanges] = useState(false)
  const [submissionMode, setSubmissionMode] = useState<SubmissionMode | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (task.isPending) return <LoadingState />
  if (task.isError) return <ErrorState error={task.error} />

  const t = task.data
  const actions = me ? taskActions(me, t) : []
  const canEdit = me ? canEditContent(me, t.createdBy, t.status === 'approved') : false
  const today = todayInTeamTz()
  const overdue = isOverdue(t, today)
  const assignee = nameOf(profiles.data, t.assignedTo)
  const allAttachments = attachments.data ?? []
  const brief = allAttachments.filter((a) => a.kind === 'brief')
  // Deliberately no "created" date: a task planned a week ahead should read as starting on its
  // start day, not as something that's been sitting there since it was typed up.
  const creator = nameOf(profiles.data, t.createdBy)
  // The checklist shows when it has items, or when this viewer could start one.
  const showChecklist = t.checklistTotal > 0 || (me ? canEditChecklist(me, t) : false)

  async function setTo(status: TaskStatus) {
    setError(null)
    try {
      await setStatus.mutateAsync({ id: t.id, status })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the status')
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
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-fg-muted">
          <span>From {creator}</span>
          {t.startDate && (
            <span>
              {notStartedBy(t, today) ? 'Starts' : 'Started'} {formatDayHeading(t.startDate)}
            </span>
          )}
          {t.doneAt && <span>Finished {formatDateTime(t.doneAt)}</span>}
        </div>

        {(t.explanation || showChecklist || brief.length > 0) && (
          <div className="space-y-3 border-t border-line pt-4">
            {t.explanation && (
              <div>
                <h2 className={`${ui.sectionTitle} mb-1.5`}>Details</h2>
                {/* Markdown without raw HTML: pasted markup shows as text, never runs. */}
                <Markdown className="text-sm leading-relaxed text-fg">{t.explanation}</Markdown>
              </div>
            )}
            {showChecklist && <ChecklistSection task={t} me={me} />}
            {brief.length > 0 && (
              <div>
                <h2 className={`${ui.sectionTitle} mb-1.5`}>
                  Attachments <span className="text-fg-muted">({brief.length})</span>
                </h2>
                <AttachmentList attachments={brief} task={t} me={me} />
              </div>
            )}
          </div>
        )}
        {attachments.isError && <ErrorState error={attachments.error} />}
      </header>

      <div className="flex flex-wrap gap-2">
        {actions.map((action) => {
          if (action === 'requestChanges') {
            return (
              <button key={action} type="button" onClick={() => setRequestingChanges(true)} className={ui.btnSecondary}>
                Request changes
              </button>
            )
          }
          const submit = SUBMIT_ACTIONS[action]
          if (submit) {
            if (submissionMode) return null // the form is already open below
            return (
              <button key={action} type="button" onClick={() => setSubmissionMode(submit.mode)} className={ui.btnPrimary}>
                {submit.label}
              </button>
            )
          }
          const direct = ACTIONS[action as DirectAction]
          return (
            <button
              key={action}
              type="button"
              disabled={setStatus.isPending}
              onClick={() => setTo(direct.to)}
              className={direct.primary ? ui.btnPrimary : ui.btnSecondary}
            >
              {direct.label}
            </button>
          )
        })}
        {canEdit && (
          <Link to={`/tasks/${t.id}/edit`} className={ui.btnSecondary}>
            Edit
          </Link>
        )}
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

      <CommentThread
        target={{ taskId: t.id }}
        canComment={me ? canComment(me, { kind: 'task', assignedTo: t.assignedTo, createdBy: t.createdBy }) : false}
      />

      <RequestChangesDialog
        open={requestingChanges}
        itemTitle={t.title}
        onCancel={() => setRequestingChanges(false)}
        onSubmit={async (body) => {
          await requestChanges.mutateAsync({ id: t.id, body })
          setRequestingChanges(false)
        }}
      />
    </article>
  )
}
