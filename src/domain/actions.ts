import type { Finding, FindingStatus, Profile, Task, TaskStatus } from '../data/types'

// One source for what the buttons are called and where they lead. The database enforces the same
// arrows (set_finding_status / set_task_status); this only decides which buttons to *show*.

export type FindingAction = 'markFixed' | 'needInfo' | 'notABug' | 'reply' | 'verify' | 'stillBroken' | 'reopen'
export type TaskAction =
  | 'start'
  | 'backToTodo'
  | 'block'
  | 'unblock'
  | 'finish'
  | 'approve'
  | 'requestChanges'
  | 'withdraw'
  | 'reopen'

export const FINDING_STATUS_LABEL: Record<FindingStatus, string> = {
  open: 'Open',
  needs_info: 'Need more info',
  fixed: 'Fixed, please re-check',
  not_a_bug: 'Not a bug',
  verified: 'Verified',
}

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  blocked: 'Blocked',
  waiting_for_review: 'Waiting for review',
  done: 'Done',
}

export const ACTION_LABEL: Record<FindingAction | TaskAction, string> = {
  markFixed: 'Mark fixed',
  needInfo: 'Need more info',
  notABug: 'Not a bug',
  reply: 'Reply',
  verify: 'Verified',
  stillBroken: 'Still broken',
  start: 'Start',
  backToTodo: 'Back to To do',
  block: 'Blocked…',
  unblock: 'Unblock',
  finish: 'Mark done',
  approve: 'Approve',
  requestChanges: 'Request changes',
  withdraw: 'Withdraw',
  reopen: 'Reopen',
}

export const FINDING_ACTION_TARGET: Record<FindingAction, FindingStatus> = {
  markFixed: 'fixed',
  needInfo: 'needs_info',
  notABug: 'not_a_bug',
  reply: 'open',
  verify: 'verified',
  stillBroken: 'open',
  reopen: 'open',
}

/** Where a task action leads. `finish` depends on whether the task needs a second pair of eyes. */
export function taskActionTarget(a: TaskAction, t: Task): TaskStatus {
  switch (a) {
    case 'start':
    case 'unblock':
    case 'requestChanges':
    case 'withdraw':
    case 'reopen':
      return 'in_progress'
    case 'backToTodo':
      return 'todo'
    case 'block':
      return 'blocked'
    case 'finish':
      return t.needsReview ? 'waiting_for_review' : 'done'
    case 'approve':
      return 'done'
  }
}

/** Buttons `me` can press on a finding. Anyone may act, except the fixer can't verify their own fix. */
export function findingActions(me: Profile, f: Finding): FindingAction[] {
  switch (f.status) {
    case 'open':
      return ['markFixed', 'needInfo', 'notABug']
    case 'needs_info':
      return ['reply', 'markFixed', 'notABug']
    case 'fixed':
      return me.id === f.fixedBy ? ['stillBroken'] : ['verify', 'stillBroken']
    case 'not_a_bug':
    case 'verified':
      return ['reopen']
  }
}

/** Buttons `me` can press on a task. The submitter can't approve their own work, only withdraw it. */
export function taskActions(me: Profile, t: Task): TaskAction[] {
  switch (t.status) {
    case 'todo':
      return ['start', 'block', 'finish']
    case 'in_progress':
      return ['backToTodo', 'block', 'finish']
    case 'blocked':
      return ['unblock']
    case 'waiting_for_review':
      return me.id === t.submittedBy ? ['withdraw'] : ['approve', 'requestChanges']
    case 'done':
      return ['reopen']
  }
}

const COMMENT_ACTIONS: ReadonlySet<string> = new Set([
  'needInfo',
  'notABug',
  'reply',
  'stillBroken',
  'reopen',
  'requestChanges',
])

/** Does this action require the person to write a comment first? */
export function needsComment(a: FindingAction | TaskAction): boolean {
  return COMMENT_ACTIONS.has(a)
}

/** Does this action require a reason (blocking a task)? */
export function needsReason(a: FindingAction | TaskAction): boolean {
  return a === 'block'
}
