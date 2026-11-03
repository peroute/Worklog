import type { Finding, Task } from '../data/types'
import { finishedOn, isOverdue } from './bucketTasks'

export interface DaySummary {
  /** Tasks waiting for review plus findings marked fixed: someone needs to look (all, not just this day). */
  waitingForReview: number
  /** Tasks that are blocked (all). */
  blocked: number
  /** Open team tasks whose deadline is before the viewed day. */
  overdue: number
  /** Tasks finished on the viewed day (Central time). */
  done: number
}

/** Totals for the Today summary strip. `findings` are ALL findings, not just the day's. */
export function daySummary(tasks: Task[], findings: Finding[], viewedDate: string): DaySummary {
  return {
    waitingForReview:
      findings.filter((f) => f.status === 'fixed').length + tasks.filter((t) => t.status === 'waiting_for_review').length,
    blocked: tasks.filter((t) => t.status === 'blocked').length,
    overdue: tasks.filter((t) => isOverdue(t, viewedDate)).length,
    done: tasks.filter((t) => finishedOn(t, viewedDate)).length,
  }
}
