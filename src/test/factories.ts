// Test data builders: each test overrides only the fields it cares about.
import type { ChecklistItem, Finding, Profile, Task, TaskAttachment } from '../data/types'

/** "lead" is only a fixture name now: every user has the same rights. */
export const lead: Profile = { id: 'lead-id', displayName: 'Lead' }
export const hedi: Profile = { id: 'hedi-id', displayName: 'Hedi' }
export const khaushik: Profile = { id: 'khaushik-id', displayName: 'Khaushik' }

let seq = 0
const nextId = (prefix: string) => `${prefix}-${++seq}`

export function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: nextId('task'),
    projectId: 'project-1',
    title: 'A task',
    explanation: null,
    assignedTo: hedi.id,
    deadline: null,
    startDate: null,
    status: 'todo',
    needsReview: false,
    blockedReason: null,
    submittedBy: null,
    approvedBy: null,
    doneAt: null,
    submissionNote: null,
    createdBy: lead.id,
    createdAt: '2026-10-20T15:00:00Z',
    deletedAt: null,
    deletedBy: null,
    checklistTotal: 0,
    checklistDone: 0,
    ...overrides,
  }
}

export function makeChecklistItem(overrides: Partial<ChecklistItem> = {}): ChecklistItem {
  return {
    id: nextId('item'),
    taskId: 'task-1',
    title: 'A step',
    position: 0,
    done: false,
    doneBy: null,
    doneAt: null,
    createdAt: '2026-11-02T15:00:00Z',
    ...overrides,
  }
}

export function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: nextId('finding'),
    projectId: 'project-1',
    taskId: null,
    title: 'A finding',
    explanation: 'Details',
    findingDate: '2026-10-29',
    status: 'open',
    authorId: hedi.id,
    fixedBy: null,
    createdAt: '2026-10-29T15:00:00Z',
    updatedAt: '2026-10-29T15:00:00Z',
    deletedAt: null,
    deletedBy: null,
    imageCount: 0,
    ...overrides,
  }
}

export function makeAttachment(overrides: Partial<TaskAttachment> = {}): TaskAttachment {
  const id = nextId('attachment')
  return {
    id,
    taskId: 'task-1',
    storagePath: `tasks/task-1/${id}.pdf`,
    fileName: 'test-plan.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 2048,
    position: 0,
    uploadedBy: lead.id,
    kind: 'brief',
    deletedAt: null,
    deletedBy: null,
    url: `https://signed/${id}`,
    ...overrides,
  }
}
