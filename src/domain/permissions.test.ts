import { describe, expect, it } from 'vitest'
import { hedi, khaushik, lead, makeFinding, makeTask } from '../test/factories'
import type { FindingStatus, TaskStatus } from '../data/types'
import {
  canAttachToTask,
  canComment,
  canDeleteProject,
  canEditChecklist,
  canEditContent,
  canRemoveTaskAttachment,
  canTickChecklist,
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

// Mirrors task_checklist_items_guard: the creator writes the list, the assignee ticks it.
describe('checklist permissions', () => {
  it('lets the creator edit the list until approval, and the lead always', () => {
    expect(canEditChecklist(hedi, makeTask({ createdBy: hedi.id, status: 'submitted' }))).toBe(true)
    expect(canEditChecklist(hedi, makeTask({ createdBy: hedi.id, status: 'approved' }))).toBe(false)
    expect(canEditChecklist(lead, makeTask({ createdBy: hedi.id, status: 'approved' }))).toBe(true)
  })

  it('does not let the assignee edit the list', () => {
    expect(canEditChecklist(khaushik, makeTask({ createdBy: hedi.id, assignedTo: khaushik.id }))).toBe(false)
  })

  it('lets the assignee tick only while it is their turn', () => {
    const mine = (status: TaskStatus) => makeTask({ createdBy: hedi.id, assignedTo: khaushik.id, status })
    expect(canTickChecklist(khaushik, mine('todo'))).toBe(true)
    expect(canTickChecklist(khaushik, mine('changes_requested'))).toBe(true)
    for (const status of ['submitted', 'resubmitted', 'approved'] as TaskStatus[]) {
      expect(canTickChecklist(khaushik, mine(status))).toBe(false)
    }
  })

  it('lets the lead tick at any status but not the creator', () => {
    expect(canTickChecklist(lead, makeTask({ assignedTo: khaushik.id, status: 'approved' }))).toBe(true)
    expect(canTickChecklist(hedi, makeTask({ createdBy: hedi.id, assignedTo: khaushik.id, status: 'todo' }))).toBe(false)
  })
})
