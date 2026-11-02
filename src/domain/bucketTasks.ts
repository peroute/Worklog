import type { Task } from '../data/types'
import { toTeamDate } from '../lib/dates'

export interface TaskBuckets {
  /** The lead requested changes: the person must handle these first. */
  changesRequested: Task[]
  dueOrOverdue: Task[]
  upcoming: Task[]
  noDeadline: Task[]
  completed: Task[]
}

const FINISHED: Task['status'][] = ['submitted', 'resubmitted', 'approved']

/**
 * Splits one person's tasks into the Today-column groups for `viewedDate`.
 * Open groups hold `todo` tasks (current status); `completed` = finished (submitted, resubmitted or
 * approved) with `done_at` on the viewed Central day. Date strings compare as text.
 */
export function bucketTasks(tasks: Task[], personId: string, viewedDate: string): TaskBuckets {
  const buckets: TaskBuckets = { changesRequested: [], dueOrOverdue: [], upcoming: [], noDeadline: [], completed: [] }

  for (const task of tasks) {
    if (task.assignedTo !== personId) continue

    if (task.status === 'changes_requested') {
      buckets.changesRequested.push(task)
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

/** To do, with a deadline strictly before `today` (due today is not overdue yet). */
export function isOverdue(task: Task, today: string): boolean {
  return task.status === 'todo' && task.deadline !== null && task.deadline < today
}

/** Finished on the given Central day (submitted, resubmitted or approved). */
export function finishedOn(task: Task, day: string): boolean {
  return FINISHED.includes(task.status) && task.doneAt !== null && toTeamDate(task.doneAt) === day
}
