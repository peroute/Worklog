import { describe, expect, it } from 'vitest'
import { hedi, khaushik, lead, makeTask } from '../test/factories'
import { canDeleteProject, canEditContent, canSetTaskStatus } from './permissions'

// These mirror the DB rules (spec §6) so the UI can hide buttons that would fail anyway.
describe('UI permission checks', () => {
  it('lets only the owner or lead edit content', () => {
    expect(canEditContent(hedi, khaushik.id)).toBe(false)
    expect(canEditContent(lead, khaushik.id)).toBe(true)
    expect(canEditContent(hedi, hedi.id)).toBe(true)
  })

  it('lets only the lead delete projects', () => {
    expect(canDeleteProject(hedi)).toBe(false)
    expect(canDeleteProject(lead)).toBe(true)
  })

  it('lets the assignee, creator, or lead change a task status', () => {
    const task = makeTask({ assignedTo: hedi.id, createdBy: lead.id })
    expect(canSetTaskStatus(hedi, task)).toBe(true)
    expect(canSetTaskStatus(lead, task)).toBe(true)
    expect(canSetTaskStatus(khaushik, task)).toBe(false)
    expect(canSetTaskStatus(khaushik, makeTask({ assignedTo: hedi.id, createdBy: khaushik.id }))).toBe(true)
  })
})
