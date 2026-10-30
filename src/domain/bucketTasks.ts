import type { Task } from '../data/types'
import { toTeamDate } from '../lib/dates'

export interface TaskBuckets {
  dueOrOverdue: Task[]
  upcoming: Task[]
  noDeadline: Task[]
  completed: Task[]
}

/**
 * Splits one person's tasks into the Today-column groups (spec §7.2) for `viewedDate`.
 * Open groups reflect current status; `completed` uses the Central day the task was finished.
 * Date strings are 'YYYY-MM-DD', so plain string comparison orders them correctly.
 */
export function bucketTasks(tasks: Task[], personId: string, viewedDate: string): TaskBuckets {
  const buckets: TaskBuckets = { dueOrOverdue: [], upcoming: [], noDeadline: [], completed: [] }

  for (const task of tasks) {
    if (task.assignedTo !== personId) continue

    if (task.status === 'done') {
      if (task.doneAt && toTeamDate(task.doneAt) === viewedDate) buckets.completed.push(task)
    } else if (task.deadline === null) {
      buckets.noDeadline.push(task)
    } else if (task.deadline <= viewedDate) {
      buckets.dueOrOverdue.push(task)
    } else {
      buckets.upcoming.push(task)
    }
  }
  return buckets
}

/** Open, with a deadline strictly before `today` (due today is not overdue yet). */
export function isOverdue(task: Task, today: string): boolean {
  return task.status === 'todo' && task.deadline !== null && task.deadline < today
}
