import type { Finding, Task } from '../data/types'
import { finishedOn, isOverdue } from './bucketTasks'

export interface DaySummary {
  /** Submitted or resubmitted findings and tasks: the lead's turn (all, not just this day). */
  waitingForLead: number
  /** Findings and tasks with changes requested: the assignee's turn (all). */
  changesRequested: number
  /** Team tasks still to do whose deadline is before the viewed day. */
  overdue: number
  /** Tasks finished on the viewed day (Central time). */
  done: number
}

/** Totals for the Today summary strip. `findings` are ALL findings, not just the day's. */
export function daySummary(tasks: Task[], findings: Finding[], viewedDate: string): DaySummary {
  return {
    waitingForLead:
      findings.filter((f) => f.status === 'submitted' || f.status === 'resubmitted').length +
      tasks.filter((t) => t.status === 'submitted' || t.status === 'resubmitted').length,
    changesRequested:
      findings.filter((f) => f.status === 'changes_requested').length +
      tasks.filter((t) => t.status === 'changes_requested').length,
    overdue: tasks.filter((t) => isOverdue(t, viewedDate)).length,
    done: tasks.filter((t) => finishedOn(t, viewedDate)).length,
  }
}
