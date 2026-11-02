// UI-side mirror of the database rules (review-flow spec §2). These only decide which buttons
// to SHOW; the database guards are the source of truth and reject anything these miss.
import type { Finding, Profile, Task } from '../data/types'

/** Edit/delete a finding or task: its owner or the lead. Approved work (`frozen`) is lead-only. */
export function canEditContent(me: Profile, ownerId: string, frozen = false): boolean {
  return me.role === 'lead' || (me.id === ownerId && !frozen)
}

export function canDeleteProject(me: Profile): boolean {
  return me.role === 'lead'
}

export type FindingAction = 'approve' | 'requestChanges' | 'reopen' | 'resubmit'

/** Status buttons `me` may use on a finding. */
export function findingActions(me: Profile, f: Finding): FindingAction[] {
  const isLead = me.role === 'lead'
  const isAuthor = me.id === f.authorId

  if (isLead && (f.status === 'submitted' || f.status === 'resubmitted')) {
    // Nobody reviews the lead: their own work can be approved but they can't request changes from themselves.
    return isAuthor ? ['approve'] : ['approve', 'requestChanges']
  }
  if (isLead && f.status === 'approved') return ['reopen']
  if (isAuthor && f.status === 'changes_requested') return ['resubmit']
  return []
}

export type TaskAction = 'markDone' | 'undoDone' | 'resubmit' | 'approve' | 'requestChanges' | 'reopen'

/** Status buttons `me` may use on a task. Assignee actions first, then the lead's review. */
export function taskActions(me: Profile, t: Task): TaskAction[] {
  const actions: TaskAction[] = []
  const isLead = me.role === 'lead'
  const isAssignee = me.id === t.assignedTo

  if (isAssignee) {
    if (t.status === 'todo') actions.push('markDone')
    if (t.status === 'submitted') actions.push('undoDone')
    if (t.status === 'changes_requested') actions.push('resubmit')
  }
  if (isLead) {
    if (t.status === 'submitted' || t.status === 'resubmitted') {
      actions.push('approve')
      if (!isAssignee) actions.push('requestChanges')
    }
    if (t.status === 'approved') actions.push('reopen')
  }
  return actions
}

type CommentItem = { kind: 'finding'; authorId: string } | { kind: 'task'; assignedTo: string; createdBy: string }

/** The thread is between the lead and whoever's work it is. */
export function canComment(me: Profile, item: CommentItem): boolean {
  if (me.role === 'lead') return true
  if (item.kind === 'finding') return me.id === item.authorId
  return me.id === item.assignedTo || me.id === item.createdBy
}
