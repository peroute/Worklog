// Test data builders: each test overrides only the fields it cares about.
import type { Finding, Profile, Task } from '../data/types'

export const lead: Profile = { id: 'lead-id', displayName: 'Lead', role: 'lead' }
export const hedi: Profile = { id: 'hedi-id', displayName: 'Hedi', role: 'member' }
export const khaushik: Profile = { id: 'khaushik-id', displayName: 'Khaushik', role: 'member' }

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
    status: 'todo',
    doneAt: null,
    createdBy: lead.id,
    createdAt: '2026-10-20T15:00:00Z',
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
    status: 'submitted',
    authorId: hedi.id,
    createdAt: '2026-10-29T15:00:00Z',
    updatedAt: '2026-10-29T15:00:00Z',
    imageCount: 0,
    ...overrides,
  }
}
