import type { Finding, Profile, Project, Task } from '../data/types'
import { whoseTurnFinding, whoseTurnTask } from './turn'

export interface Inbox {
  needsYou: { findings: Finding[]; tasks: Task[] }
  waitingOnOthers: { findings: Finding[]; tasks: Task[] }
}

const oldestFirst = (a: { createdAt: string }, b: { createdAt: string }) => a.createdAt.localeCompare(b.createdAt)

/**
 * Splits open items into "your move" and "you're waiting on someone else", oldest first.
 * Closed items (nobody's turn) appear nowhere.
 */
export function buildInbox(
  me: Profile,
  data: { findings: Finding[]; tasks: Task[]; projects: Project[]; profiles: Profile[] },
): Inbox {
  const inbox: Inbox = {
    needsYou: { findings: [], tasks: [] },
    waitingOnOthers: { findings: [], tasks: [] },
  }
  const ctx = { tasks: data.tasks, projects: data.projects, profiles: data.profiles }

  for (const f of [...data.findings].sort(oldestFirst)) {
    const turn = whoseTurnFinding(f, ctx)
    if (turn.includes(me.id)) inbox.needsYou.findings.push(f)
    else if (turn.length > 0 && f.authorId === me.id) inbox.waitingOnOthers.findings.push(f)
  }

  for (const t of [...data.tasks].sort(oldestFirst)) {
    const turn = whoseTurnTask(t, data.profiles)
    if (turn.includes(me.id)) inbox.needsYou.tasks.push(t)
    else if (turn.length > 0 && (t.createdBy === me.id || t.assignedTo === me.id)) inbox.waitingOnOthers.tasks.push(t)
  }
  return inbox
}

/** The badge number: only what needs you. */
export function inboxCount(inbox: Inbox): number {
  return inbox.needsYou.findings.length + inbox.needsYou.tasks.length
}
