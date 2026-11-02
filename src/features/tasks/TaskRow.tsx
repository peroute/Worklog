import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { StatusBadge } from '../../components/StatusBadge'
import { statusEdge, ui } from '../../components/ui'
import type { Profile, Task } from '../../data/types'
import { isOverdue } from '../../domain/bucketTasks'
import { canEditContent, taskActions } from '../../domain/permissions'
import { formatDayHeading, todayInTeamTz } from '../../lib/dates'
import { useDeleteTask, useSetTaskStatus } from './queries'

interface TaskRowProps {
  task: Task
  /** Omitted inside a person's own Today column, where it would repeat the heading. */
  assigneeName?: string
  /** Shown on cross-project lists (Tasks, Today); omitted on a project's own page. */
  projectName?: string
  me: Profile | undefined
}

const smallAction = 'rounded-md px-2 py-1 text-xs font-medium transition-colors'

/** One task line, reused on the Project, Tasks and Today pages. Owns its own actions. */
export function TaskRow({ task, assigneeName, projectName, me }: TaskRowProps) {
  const setStatus = useSetTaskStatus()
  const deleteTask = useDeleteTask()
  const [expanded, setExpanded] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const overdue = isOverdue(task, todayInTeamTz())
  const actions = me ? taskActions(me, task) : []
  // The checkbox is the assignee's To do ⇄ Done switch; review states show their badge instead.
  const showCheckbox = task.status === 'todo' || task.status === 'submitted'
  const canToggle = actions.includes('markDone') || actions.includes('undoDone')
  // Approved work is frozen for everyone but the lead.
  const canEdit = me ? canEditContent(me, task.createdBy, task.status === 'approved') : false
  const done = task.status !== 'todo' && task.status !== 'changes_requested'
  const edgeClass = statusEdge(task.status, overdue)

  async function run(action: () => Promise<unknown>) {
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  return (
    <div className={`px-4 py-3 transition-colors hover:bg-surface-2/50 ${edgeClass}`}>
      <div className="flex items-start gap-3">
        {showCheckbox ? (
          <input
            type="checkbox"
            checked={done}
            disabled={!canToggle || setStatus.isPending}
            aria-label={`Mark “${task.title}” done`}
            onChange={(e) =>
              run(() => setStatus.mutateAsync({ id: task.id, status: e.target.checked ? 'submitted' : 'todo' }))
            }
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-blue-600 disabled:cursor-not-allowed"
          />
        ) : (
          <span aria-hidden="true" className="w-4 shrink-0" />
        )}

        <div className="min-w-0 flex-1">
          <p
            className={`text-sm font-medium ${
              task.status === 'approved' ? 'text-fg-subtle line-through' : done ? 'text-fg-muted' : 'text-fg'
            }`}
          >
            {projectName && <span className={`${ui.tag} mr-2 align-middle`}>{projectName}</span>}
            <Link to={`/tasks/${task.id}`} className="hover:text-accent-fg hover:underline">
              {task.title}
            </Link>
          </p>
          {/* Meta wraps under the title on narrow screens. */}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
            {task.status !== 'todo' && <StatusBadge status={task.status} />}
            {assigneeName && <span>{assigneeName}</span>}
            {overdue && (
              <span className="rounded-md bg-overdue-soft px-1.5 py-0.5 font-semibold text-overdue">Overdue</span>
            )}
            {task.deadline && (
              <span className={overdue ? 'font-medium text-overdue' : ''}>
                <span aria-hidden="true">📅 </span>
                {formatDayHeading(task.deadline)}
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {task.explanation && (
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
              className={`${smallAction} text-accent-fg hover:bg-accent-soft`}
            >
              Details
            </button>
          )}
          {canEdit && (
            <>
              <Link
                to={`/tasks/${task.id}/edit`}
                className={`${smallAction} text-fg-muted hover:bg-surface-2 hover:text-fg`}
              >
                Edit
              </Link>
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className={`${smallAction} text-overdue hover:bg-overdue-soft`}
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {expanded && task.explanation && (
        <p className="mt-2 ml-7 rounded-lg bg-surface-2 p-3 text-sm leading-relaxed text-fg whitespace-pre-wrap">
          {task.explanation}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-1 ml-7 text-xs font-medium text-overdue">
          {error}
        </p>
      )}

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete this task?"
        body={`“${task.title}” will be removed. Findings linked to it are kept.`}
        confirmLabel="Delete task"
        busy={deleteTask.isPending}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() => run(() => deleteTask.mutateAsync(task.id))}
      />
    </div>
  )
}
