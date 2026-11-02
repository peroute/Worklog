import { describe, expect, it } from 'vitest'
import { hedi, khaushik, lead, makeFinding, makeTask } from '../test/factories'
import type { FindingStatus, TaskStatus } from '../data/types'
import {
  canAttachToTask,
  canComment,
  canDeleteProject,
  canEditContent,
  canRemoveTaskAttachment,
  findingActions,
  taskActions,
} from './permissions'

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

describe('task attachments', () => {
  // Hedi assigned the task to Khaushik.
  const open = makeTask({ createdBy: hedi.id, assignedTo: khaushik.id, status: 'todo' })
  const approved = { ...open, status: 'approved' as const }
  const outsider = { ...hedi, id: 'someone-else' }

  it('lets the creator, the assignee (proof of work) and the lead attach', () => {
    expect(canAttachToTask(hedi, open)).toBe(true)
    expect(canAttachToTask(khaushik, open)).toBe(true)
    expect(canAttachToTask(lead, open)).toBe(true)
    expect(canAttachToTask(outsider, open)).toBe(false)
  })

  it('still allows adding files after approval', () => {
    expect(canAttachToTask(hedi, approved)).toBe(true)
    expect(canAttachToTask(khaushik, approved)).toBe(true)
    expect(canAttachToTask(outsider, approved)).toBe(false)
  })

  it('lets people remove only what they added; the lead removes anything', () => {
    const brief = { uploadedBy: hedi.id }
    const proof = { uploadedBy: khaushik.id }
    expect(canRemoveTaskAttachment(hedi, open, brief)).toBe(true)
    expect(canRemoveTaskAttachment(hedi, open, proof)).toBe(false) // creator can't erase the proof
    expect(canRemoveTaskAttachment(khaushik, open, brief)).toBe(false) // assignee can't erase the brief
    expect(canRemoveTaskAttachment(khaushik, open, proof)).toBe(true)
    expect(canRemoveTaskAttachment(khaushik, approved, proof)).toBe(false)
    expect(canRemoveTaskAttachment(lead, approved, proof)).toBe(true)
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
