import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Markdown } from '../../components/Markdown'
import { StatusBadge } from '../../components/StatusBadge'
import { statusEdge, ui } from '../../components/ui'
import type { Profile, Task } from '../../data/types'
import { needsReason, taskActions, taskActionTarget, type FindingAction, type TaskAction } from '../../domain/actions'
import { isOverdue, notStartedBy } from '../../domain/bucketTasks'
import { whoseTurnTask } from '../../domain/turn'
import { formatDayHeading, todayInTeamTz } from '../../lib/dates'
import { NewDot } from '../items/NewDot'
import { useItemStatusMutation } from '../items/queries'
import { StatusActions } from '../items/StatusActions'
import { useProfiles } from '../team/queries'
import { useChecklist } from './checklistQueries'
import { useDeleteTask } from './queries'

interface TaskRowProps {
  task: Task
  /** Omitted inside a person's own Today column, where it would repeat the heading. */
  assigneeName?: string
  /** Who assigned it. Callers omit it for self-assigned tasks, where it would say nothing new. */
  creatorName?: string
  /** Shown on cross-project lists (Tasks, Today); omitted on a project's own page. */
  projectName?: string
  /** Decides whose turn it is (buttons vs. "More"). Everyone may edit, delete and act. */
  me: Profile | undefined
}

const smallAction = 'rounded-md px-2 py-1 text-xs font-medium transition-colors'
// Same shape as ui.tag, but the colours are chosen here so the "all done" green never fights the grey.
const chipBase = 'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium'

/** One task line, reused on the Project, Tasks and Today pages. Owns its own actions. */
export function TaskRow({ task, assigneeName, creatorName, projectName, me }: TaskRowProps) {
  const setStatus = useItemStatusMutation()
  const deleteTask = useDeleteTask()
  const profiles = useProfiles()
  const [expanded, setExpanded] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [confirmingFinish, setConfirmingFinish] = useState(false)
  // Item titles are only fetched when the dialog opens: a list page can show dozens of rows.
  const checklist = useChecklist(task.id, { enabled: confirmingFinish })
  const unticked = task.checklistTotal - task.checklistDone
  const [error, setError] = useState<string | null>(null)

  const today = todayInTeamTz()
  const overdue = isOverdue(task, today)
  // Scheduled for later: hidden on Today until then, labeled everywhere else it's listed.
  const waiting = task.status === 'todo' && notStartedBy(task, today)
  const actions = me ? taskActions(me, task) : []
  // Don't guess whose turn it is before the team list is in: the buttons would jump to "More" and back.
  const myTurn = Boolean(me && profiles.data && whoseTurnTask(task, profiles.data).includes(me.id))
  const finished = task.status === 'done'
  const edgeClass = statusEdge(task.status, overdue)

  async function move(action: TaskAction, text?: string) {
    await setStatus.mutateAsync({
      type: 'task',
      id: task.id,
      to: taskActionTarget(action, task),
      ...(text === undefined ? {} : needsReason(action) ? { reason: text } : { comment: text }),
    })
  }

  // StatusActions shows a refused move itself (it catches what this rejects with).
  async function onRun(action: FindingAction | TaskAction, text?: string) {
    const taskAction = action as TaskAction
    if (taskAction === 'finish' && unticked > 0) {
      // Finishing with open checklist items asks first; the dialog does the move if they insist.
      setConfirmingFinish(true)
      return
    }
    await move(taskAction, text)
  }

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
        <div className="min-w-0 flex-1">
          <p
            className={`flex items-center gap-2 text-sm font-medium ${
              finished ? 'text-fg-subtle line-through' : 'text-fg'
            }`}
          >
            <NewDot item={{ type: 'task', id: task.id }} />
            <span className="min-w-0">
              {projectName && <span className={`${ui.tag} mr-2 align-middle`}>{projectName}</span>}
              <Link to={`/tasks/${task.id}`} className="hover:text-accent-fg hover:underline">
                {task.title}
              </Link>
            </span>
          </p>
          {/* Meta wraps under the title on narrow screens. */}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
            {task.status !== 'todo' && <StatusBadge status={task.status} />}
            {assigneeName && <span>{assigneeName}</span>}
            {creatorName && <span>From {creatorName}</span>}
            {waiting && task.startDate && (
              <span className="rounded-md bg-surface-2 px-1.5 py-0.5 font-medium">
                Starts {formatDayHeading(task.startDate)}
              </span>
            )}
            {task.checklistTotal > 0 && (
              <span
                title={`${task.checklistDone} of ${task.checklistTotal} checklist items done`}
                className={`${chipBase} ${unticked === 0 ? 'bg-done-soft text-done' : 'bg-surface-2 text-fg-muted'}`}
              >
                <span aria-hidden="true">✓</span>
                {task.checklistDone}/{task.checklistTotal}
              </span>
            )}
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
          {actions.length > 0 && (
            <div className="mt-2">
              <StatusActions actions={actions} primary={myTurn} onRun={onRun} />
            </div>
          )}
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
        </div>
      </div>

      {expanded && task.explanation && (
        <Markdown className="mt-2 rounded-lg bg-surface-2 p-3 text-sm leading-relaxed text-fg">
          {task.explanation}
        </Markdown>
      )}
      {error && (
        <p role="alert" className="mt-1 text-xs font-medium text-overdue">
          {error}
        </p>
      )}

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete this task?"
        body={`“${task.title}” moves to Trash. You can restore it from there. Findings linked to it are kept.`}
        confirmLabel="Delete task"
        busy={deleteTask.isPending}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() => run(() => deleteTask.mutateAsync(task.id))}
      />

      <ConfirmDialog
        open={confirmingFinish}
        tone="primary"
        title={`${unticked} of ${task.checklistTotal} checklist items aren't ticked`}
        body={
          <>
            {checklist.data && (
              <ul className="list-disc space-y-0.5 pl-5 text-fg">
                {checklist.data
                  .filter((item) => !item.done)
                  .map((item) => (
                    <li key={item.id}>{item.title}</li>
                  ))}
              </ul>
            )}
            <p className="mt-2">You can still finish it. Open the task to add a note saying why.</p>
          </>
        }
        confirmLabel="Finish anyway"
        busy={setStatus.isPending}
        onCancel={() => setConfirmingFinish(false)}
        onConfirm={() =>
          run(async () => {
            await move('finish')
            setConfirmingFinish(false)
          })
        }
      />
    </div>
  )
}
