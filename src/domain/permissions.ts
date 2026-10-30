// UI-side mirror of the database rules (spec §6). These only decide which buttons to SHOW;
// the database is still the source of truth and rejects anything these miss.
import type { Profile, Task } from '../data/types'

/** Edit/delete a finding or task: its owner (author/creator) or the lead. */
export function canEditContent(me: Profile, ownerId: string): boolean {
  return me.role === 'lead' || me.id === ownerId
}

export function canDeleteProject(me: Profile): boolean {
  return me.role === 'lead'
}

/** Mark a task done/undone: the assignee, the creator, or the lead. */
export function canSetTaskStatus(me: Profile, task: Task): boolean {
  return me.role === 'lead' || me.id === task.createdBy || me.id === task.assignedTo
}
