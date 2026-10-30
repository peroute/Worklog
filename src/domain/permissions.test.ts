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

  it('lets the lead close or send back an open or fixed finding', () => {
    expect(findingActions(lead, mine('open'))).toEqual(['close', 'sendBack'])
    expect(findingActions(lead, mine('fixed'))).toEqual(['close', 'sendBack'])
  })

  it('lets the lead reopen a closed finding', () => {
    expect(findingActions(lead, mine('closed'))).toEqual(['reopen'])
  })

  it('lets the author mark a sent-back finding fixed, and nothing else', () => {
    expect(findingActions(hedi, mine('needs_review'))).toEqual(['markFixed'])
    expect(findingActions(hedi, mine('open'))).toEqual([])
    expect(findingActions(hedi, mine('fixed'))).toEqual([])
  })

  it('gives other members no status actions', () => {
    expect(findingActions(khaushik, mine('open'))).toEqual([])
    expect(findingActions(khaushik, mine('needs_review'))).toEqual([])
  })

  it('lets the lead close their own finding without sending it to themselves', () => {
    expect(findingActions(lead, makeFinding({ authorId: lead.id, status: 'open' }))).toEqual(['close'])
  })
})

describe('taskActions', () => {
  const hedis = (status: TaskStatus) => makeTask({ assignedTo: hedi.id, createdBy: khaushik.id, status })

  it('lets the assignee finish, undo, and mark fixed', () => {
    expect(taskActions(hedi, hedis('todo'))).toEqual(['markDone'])
    expect(taskActions(hedi, hedis('done'))).toEqual(['undoDone'])
    expect(taskActions(hedi, hedis('needs_review'))).toEqual(['markFixed'])
    expect(taskActions(hedi, hedis('fixed'))).toEqual([])
    expect(taskActions(hedi, hedis('approved'))).toEqual([])
  })

  it('gives the creator (not assignee) no status actions', () => {
    expect(taskActions(khaushik, hedis('todo'))).toEqual([])
    expect(taskActions(khaushik, hedis('done'))).toEqual([])
  })

  it('lets the lead approve or send back finished work, and reopen approved work', () => {
    expect(taskActions(lead, hedis('done'))).toEqual(['approve', 'sendBack'])
    expect(taskActions(lead, hedis('fixed'))).toEqual(['approve', 'sendBack'])
    expect(taskActions(lead, hedis('approved'))).toEqual(['reopen'])
    expect(taskActions(lead, hedis('todo'))).toEqual([])
  })

  it('lets the lead finish and approve their own task', () => {
    const own = (status: TaskStatus) => makeTask({ assignedTo: lead.id, status })
    expect(taskActions(lead, own('todo'))).toEqual(['markDone'])
    expect(taskActions(lead, own('done'))).toEqual(['undoDone', 'approve'])
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
