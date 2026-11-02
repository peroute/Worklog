import type { Finding, Profile, Task } from '../data/types'

interface Items {
  findings: Finding[]
  tasks: Task[]
}

export type ReviewQueues = { kind: 'lead'; waiting: Items } | { kind: 'member'; toFix: Items; waitingOnLead: Items }

const oldestFirst = <T extends { createdAt: string }>(items: T[]) =>
  [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt))

/**
 * The Review page inbox. Lead: everything waiting for them (except their own work — nobody
 * reviews the lead). Member: what they must fix, plus their work still waiting on the lead.
 */
export function reviewQueues(me: Profile, findings: Finding[], tasks: Task[]): ReviewQueues {
  if (me.role === 'lead') {
    return {
      kind: 'lead',
      waiting: {
        findings: oldestFirst(
          findings.filter((f) => (f.status === 'submitted' || f.status === 'resubmitted') && f.authorId !== me.id),
        ),
        tasks: oldestFirst(
          tasks.filter((t) => (t.status === 'submitted' || t.status === 'resubmitted') && t.assignedTo !== me.id),
        ),
      },
    }
  }
  const myFindings = findings.filter((f) => f.authorId === me.id)
  const myTasks = tasks.filter((t) => t.assignedTo === me.id)
  return {
    kind: 'member',
    toFix: {
      findings: oldestFirst(myFindings.filter((f) => f.status === 'changes_requested')),
      tasks: oldestFirst(myTasks.filter((t) => t.status === 'changes_requested')),
    },
    waitingOnLead: {
      findings: oldestFirst(myFindings.filter((f) => f.status === 'submitted' || f.status === 'resubmitted')),
      tasks: oldestFirst(myTasks.filter((t) => t.status === 'submitted' || t.status === 'resubmitted')),
    },
  }
}

/** Nav badge: how many items need the viewer to act. */
export function reviewBadgeCount(me: Profile, findings: Finding[], tasks: Task[]): number {
  const q = reviewQueues(me, findings, tasks)
  const items = q.kind === 'lead' ? q.waiting : q.toFix
  return items.findings.length + items.tasks.length
}
