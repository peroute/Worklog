import type { Finding, Task } from '../data/types'
import { toTeamDate } from '../lib/dates'
import { isOverdue } from './bucketTasks'

export interface DaySummary {
  /** That day's findings that are still open. */
  openFindings: number
  /** Team tasks still to do whose deadline is before the viewed day. */
  overdue: number
  /** Tasks finished on the viewed day (Central time). */
  done: number
}

/** Totals for the Today summary strip. `findings` are already the viewed day's. */
export function daySummary(tasks: Task[], findings: Finding[], viewedDate: string): DaySummary {
  return {
    openFindings: findings.filter((f) => f.status === 'open').length,
    overdue: tasks.filter((t) => isOverdue(t, viewedDate)).length,
    done: tasks.filter((t) => t.status === 'done' && t.doneAt !== null && toTeamDate(t.doneAt) === viewedDate).length,
  }
}
