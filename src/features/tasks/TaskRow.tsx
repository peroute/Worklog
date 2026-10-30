import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import type { Profile, Task } from '../../data/types'
import { isOverdue } from '../../domain/bucketTasks'
import { canEditContent, canSetTaskStatus } from '../../domain/permissions'
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

/** One task line, reused on the Project, Tasks and Today pages. Owns its own actions. */
export function TaskRow({ task, assigneeName, projectName, me }: TaskRowProps) {
  const setStatus = useSetTaskStatus()
  const deleteTask = useDeleteTask()
  const [expanded, setExpanded] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const overdue = isOverdue(task, todayInTeamTz())
  const canToggle = me ? canSetTaskStatus(me, task) : false
  const canEdit = me ? canEditContent(me, task.createdBy) : false
  const done = task.status === 'done'

  async function run(action: () => Promise<unknown>) {
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  return (
    <div className="px-4 py-2 text-sm">
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={done}
          disabled={!canToggle || setStatus.isPending}
          aria-label={`Mark “${task.title}” done`}
          onChange={(e) => run(() => setStatus.mutateAsync({ id: task.id, status: e.target.checked ? 'done' : 'todo' }))}
          className="h-4 w-4"
        />
        <span className={`flex-1 ${done ? 'text-gray-400 line-through' : ''}`}>
          {projectName && <span className="mr-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">{projectName}</span>}
          {task.title}
        </span>
        {assigneeName && <span className="text-gray-600">{assigneeName}</span>}
        {overdue && <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-600">Overdue</span>}
        {task.deadline && (
          <span className={overdue ? 'font-medium text-red-600' : 'text-gray-500'}>{formatDayHeading(task.deadline)}</span>
        )}
        {task.explanation && (
          <button type="button" onClick={() => setExpanded((v) => !v)} className="text-xs text-blue-600 hover:underline">
            Details
          </button>
        )}
        {canEdit && (
          <>
            <Link to={`/tasks/${task.id}/edit`} className="text-xs text-gray-600 hover:underline">
              Edit
            </Link>
            <button type="button" onClick={() => setConfirmingDelete(true)} className="text-xs text-red-600 hover:underline">
              Delete
            </button>
          </>
        )}
      </div>

      {expanded && task.explanation && (
        <p className="mt-2 ml-7 rounded bg-gray-50 p-2 text-gray-700 whitespace-pre-wrap">{task.explanation}</p>
      )}
      {error && (
        <p role="alert" className="mt-1 ml-7 text-xs text-red-600">
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
