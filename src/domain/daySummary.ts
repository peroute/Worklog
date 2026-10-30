import type { Finding, Task } from '../data/types'
import { finishedOn, isOverdue } from './bucketTasks'

export interface DaySummary {
  /** Findings open|fixed and tasks done|fixed: the lead's turn (all, not just this day). */
  waitingForLead: number
  /** Findings and tasks sent back: the assignee's turn (all). */
  needsReview: number
  /** Team tasks still to do whose deadline is before the viewed day. */
  overdue: number
  /** Tasks finished on the viewed day (Central time). */
  done: number
}

/** Totals for the Today summary strip. `findings` are ALL findings, not just the day's. */
export function daySummary(tasks: Task[], findings: Finding[], viewedDate: string): DaySummary {
  return {
    waitingForLead:
      findings.filter((f) => f.status === 'open' || f.status === 'fixed').length +
      tasks.filter((t) => t.status === 'done' || t.status === 'fixed').length,
    needsReview:
      findings.filter((f) => f.status === 'needs_review').length +
      tasks.filter((t) => t.status === 'needs_review').length,
    overdue: tasks.filter((t) => isOverdue(t, viewedDate)).length,
    done: tasks.filter((t) => finishedOn(t, viewedDate)).length,
  }
}
