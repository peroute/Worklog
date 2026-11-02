import { describe, expect, it } from 'vitest'
import { hedi, khaushik, lead, makeFinding, makeTask } from '../test/factories'
import type { FindingStatus, TaskStatus } from '../data/types'
import { canComment, canDeleteProject, canEditContent, findingActions, taskActions } from './permissions'

// These mirror the DB rules (review-flow spec §2) so the UI only shows buttons that will work.
describe('content permissions', () => {
  it('lets only the owner or lead edit content', () => {
    expect(canEditContent(hedi, khaushik.id)).toBe(false)
    expect(canEditContent(lead, khaushik.id)).toBe(true)
    expect(canEditContent(hedi, hedi.id)).toBe(true)
  })

  it('freezes approved work for everyone but the lead', () => {
    expect(canEditContent(hedi, hedi.id, true)).toBe(false)
    expect(canEditContent(lead, hedi.id, true)).toBe(true)
  })

  it('lets only the lead delete projects', () => {
    expect(canDeleteProject(hedi)).toBe(false)
    expect(canDeleteProject(lead)).toBe(true)
  })
})

describe('findingActions', () => {
  const mine = (status: FindingStatus) => makeFinding({ authorId: hedi.id, status })

  it('lets the lead approve or request changes on a submitted or resubmitted finding', () => {
    expect(findingActions(lead, mine('submitted'))).toEqual(['approve', 'requestChanges'])
    expect(findingActions(lead, mine('resubmitted'))).toEqual(['approve', 'requestChanges'])
  })

  it('lets the lead reopen an approved finding', () => {
    expect(findingActions(lead, mine('approved'))).toEqual(['reopen'])
  })

  it('lets the author resubmit a finding with changes requested, and nothing else', () => {
    expect(findingActions(hedi, mine('changes_requested'))).toEqual(['resubmit'])
    expect(findingActions(hedi, mine('submitted'))).toEqual([])
    expect(findingActions(hedi, mine('resubmitted'))).toEqual([])
  })

  it('gives other members no status actions', () => {
    expect(findingActions(khaushik, mine('submitted'))).toEqual([])
    expect(findingActions(khaushik, mine('changes_requested'))).toEqual([])
  })

  it('lets the lead approve their own finding without requesting changes from themselves', () => {
    expect(findingActions(lead, makeFinding({ authorId: lead.id, status: 'submitted' }))).toEqual(['approve'])
  })
})

describe('taskActions', () => {
  const hedis = (status: TaskStatus) => makeTask({ assignedTo: hedi.id, createdBy: khaushik.id, status })

  it('lets the assignee finish, undo, and resubmit', () => {
    expect(taskActions(hedi, hedis('todo'))).toEqual(['markDone'])
    expect(taskActions(hedi, hedis('submitted'))).toEqual(['undoDone'])
    expect(taskActions(hedi, hedis('changes_requested'))).toEqual(['resubmit'])
    expect(taskActions(hedi, hedis('resubmitted'))).toEqual([])
    expect(taskActions(hedi, hedis('approved'))).toEqual([])
  })

  it('gives the creator (not assignee) no status actions', () => {
    expect(taskActions(khaushik, hedis('todo'))).toEqual([])
    expect(taskActions(khaushik, hedis('submitted'))).toEqual([])
  })

  it('lets the lead approve or request changes on submitted work, and reopen approved work', () => {
    expect(taskActions(lead, hedis('submitted'))).toEqual(['approve', 'requestChanges'])
    expect(taskActions(lead, hedis('resubmitted'))).toEqual(['approve', 'requestChanges'])
    expect(taskActions(lead, hedis('approved'))).toEqual(['reopen'])
    expect(taskActions(lead, hedis('todo'))).toEqual([])
  })

  it('lets the lead finish and approve their own task', () => {
    const own = (status: TaskStatus) => makeTask({ assignedTo: lead.id, status })
    expect(taskActions(lead, own('todo'))).toEqual(['markDone'])
    expect(taskActions(lead, own('submitted'))).toEqual(['undoDone', 'approve'])
  })
})

describe('canComment', () => {
  it('allows the lead, the finding author, and the task assignee or creator', () => {
    expect(canComment(lead, { kind: 'finding', authorId: hedi.id })).toBe(true)
    expect(canComment(hedi, { kind: 'finding', authorId: hedi.id })).toBe(true)
    expect(canComment(khaushik, { kind: 'finding', authorId: hedi.id })).toBe(false)
    expect(canComment(khaushik, { kind: 'task', assignedTo: hedi.id, createdBy: khaushik.id })).toBe(true)
    expect(canComment(khaushik, { kind: 'task', assignedTo: hedi.id, createdBy: lead.id })).toBe(false)
  })
})
