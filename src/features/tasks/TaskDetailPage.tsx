import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { Avatar } from '../../components/Avatar'
import { ErrorState } from '../../components/ErrorState'
import { LoadingState } from '../../components/LoadingState'
import { StatusBadge } from '../../components/StatusBadge'
import { statusEdge, ui } from '../../components/ui'
import type { TaskStatus } from '../../data/types'
import { isOverdue } from '../../domain/bucketTasks'
import { canComment, canEditContent, taskActions, type TaskAction } from '../../domain/permissions'
import { formatDayHeading, todayInTeamTz } from '../../lib/dates'
import { useMe } from '../auth/useMe'
import { CommentThread } from '../comments/CommentThread'
import { useProject } from '../projects/queries'
import { RequestChangesDialog } from '../review/RequestChangesDialog'
import { nameOf, useProfiles } from '../team/queries'
import { useRequestChangesTask, useSetTaskStatus, useTask } from './queries'
import { TaskAttachments } from './TaskAttachments'

// Button label + target status for each simple status action ("requestChanges" opens a dialog instead).
const ACTIONS: Record<Exclude<TaskAction, 'requestChanges'>, { label: string; to: TaskStatus; primary: boolean }> = {
  markDone: { label: 'Mark done', to: 'submitted', primary: true },
  undoDone: { label: 'Undo done', to: 'todo', primary: false },
  resubmit: { label: 'Resubmit', to: 'resubmitted', primary: true },
  approve: { label: 'Approve', to: 'approved', primary: true },
  reopen: { label: 'Reopen', to: 'todo', primary: false },
}

/** A task's own page: details, review actions and the comment thread. */
export function TaskDetailPage() {
  const { id = '' } = useParams()
  const location = useLocation()
  // Set by the task form when some attachments didn't upload (the task itself was saved).
  const failedUploads = (location.state as { failedUploads?: number } | null)?.failedUploads ?? 0
  const { me } = useMe()
  const task = useTask(id)
  const profiles = useProfiles()
  const projectId = task.data?.projectId ?? ''
  const project = useProject(projectId, { enabled: Boolean(projectId) })
  const setStatus = useSetTaskStatus()
  const requestChanges = useRequestChangesTask()
  const [requestingChanges, setRequestingChanges] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (task.isPending) return <LoadingState />
  if (task.isError) return <ErrorState error={task.error} />

  const t = task.data
  const actions = me ? taskActions(me, t) : []
  const canEdit = me ? canEditContent(me, t.createdBy, t.status === 'approved') : false
  const overdue = isOverdue(t, todayInTeamTz())
  const assignee = nameOf(profiles.data, t.assignedTo)

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
      </header>

      <div className="flex flex-wrap gap-2">
        {actions.map((action) =>
          action === 'requestChanges' ? (
            <button key={action} type="button" onClick={() => setRequestingChanges(true)} className={ui.btnSecondary}>
              Request changes
            </button>
          ) : (
            <button
              key={action}
              type="button"
              disabled={setStatus.isPending}
              onClick={() => setTo(ACTIONS[action].to)}
              className={ACTIONS[action].primary ? ui.btnPrimary : ui.btnSecondary}
            >
              {ACTIONS[action].label}
            </button>
          ),
        )}
        {canEdit && (
          <Link to={`/tasks/${t.id}/edit`} className={ui.btnSecondary}>
            Edit
          </Link>
        )}
      </div>

      {t.explanation && (
        <p className={`${ui.card} p-5 text-sm leading-relaxed text-fg whitespace-pre-wrap`}>{t.explanation}</p>
      )}

      <TaskAttachments taskId={t.id} />

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
