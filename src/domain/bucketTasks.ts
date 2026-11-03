import type { Task } from '../data/types'
import { toTeamDate } from '../lib/dates'

export interface TaskBuckets {
  /** Stuck on something: shown first so it gets unblocked. */
  blocked: Task[]
  dueOrOverdue: Task[]
  upcoming: Task[]
  noDeadline: Task[]
  completed: Task[]
}

const FINISHED: Task['status'][] = ['waiting_for_review', 'done']
const OPEN: Task['status'][] = ['todo', 'in_progress', 'blocked']

/**
 * Splits one person's tasks into the Today-column groups for `viewedDate`.
 * Open groups hold `todo` and `in_progress` tasks; `blocked` has its own group; `completed` = waiting for
 * review or done with `done_at` on the viewed Central day. Date strings compare as text.
 * A to-do task with a start day after `viewedDate` is left out: it hasn't started yet.
 */
export function bucketTasks(tasks: Task[], personId: string, viewedDate: string): TaskBuckets {
  const buckets: TaskBuckets = { blocked: [], dueOrOverdue: [], upcoming: [], noDeadline: [], completed: [] }

  for (const task of tasks) {
    if (task.assignedTo !== personId) continue
    if (task.status === 'todo' && notStartedBy(task, viewedDate)) continue

    if (task.status === 'blocked') {
      buckets.blocked.push(task)
    } else if (FINISHED.includes(task.status)) {
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

/** Has a start day later than `day`, so it shouldn't be worked on yet. */
export function notStartedBy(task: Task, day: string): boolean {
  return task.startDate !== null && task.startDate > day
}

/** Still open (todo, in progress or blocked), with a deadline strictly before `today` (due today is not overdue yet). */
export function isOverdue(task: Task, today: string): boolean {
  return OPEN.includes(task.status) && task.deadline !== null && task.deadline < today
}

/** Finished on the given Central day (waiting for review or done). */
export function finishedOn(task: Task, day: string): boolean {
  return FINISHED.includes(task.status) && task.doneAt !== null && toTeamDate(task.doneAt) === day
}
