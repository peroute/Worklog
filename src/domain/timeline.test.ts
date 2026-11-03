import { describe, expect, it } from 'vitest'
import type { ActivityAction, ActivityEntry, Comment } from '../data/types'
import { hedi, khaushik, lead } from '../test/factories'
import { buildTimeline, describeActivity } from './timeline'

const comment = (id: string, authorId: string, createdAt: string): Comment => ({
  id,
  findingId: 'f',
  taskId: null,
  authorId,
  body: 'hi',
  createdAt,
})
const entry = (
  id: string,
  actorId: string | null,
  createdAt: string,
  action: ActivityAction = 'created',
  details: Record<string, unknown> = {},
): ActivityEntry => ({ id, actorId, action, details, createdAt })

describe('buildTimeline', () => {
  it('merges and sorts, comment before activity on equal timestamps', () => {
    const t = buildTimeline(
      [comment('c1', hedi.id, '2026-11-03T10:00:00Z'), comment('c2', hedi.id, '2026-11-03T12:00:00Z')],
      [entry('a1', lead.id, '2026-11-03T10:00:00Z'), entry('a2', lead.id, '2026-11-03T09:00:00Z')],
      khaushik,
      null,
    )
    expect(t.map((e) => (e.kind === 'comment' ? e.comment.id : e.entry.id))).toEqual(['a2', 'c1', 'a1', 'c2'])
    expect(t[0].at).toBe('2026-11-03T09:00:00Z')
  })

  it('own entries never new', () => {
    const t = buildTimeline(
      [comment('c1', hedi.id, '2026-11-03T10:00:00Z')],
      [entry('a1', hedi.id, '2026-11-03T11:00:00Z')],
      hedi,
      null,
    )
    expect(t.every((e) => !e.isNew)).toBe(true)
  })

  it("null lastSeen marks others' entries new; admin activity counts as someone else", () => {
    const t = buildTimeline(
      [comment('c1', lead.id, '2026-11-03T10:00:00Z')],
      [entry('a1', null, '2026-11-03T11:00:00Z')],
      hedi,
      null,
    )
    expect(t.map((e) => e.isNew)).toEqual([true, true])
  })

  it('only entries after lastSeen are new', () => {
    const t = buildTimeline(
      [comment('c1', lead.id, '2026-11-03T10:00:00Z'), comment('c2', lead.id, '2026-11-03T12:00:00Z')],
      [],
      hedi,
      '2026-11-03T10:00:00Z',
    )
    expect(t.map((e) => e.isNew)).toEqual([false, true])
  })
})

describe('describeActivity', () => {
  const names = (id: string) => ({ [hedi.id]: 'Hedi', [lead.id]: 'Lead' })[id] ?? 'Someone'
  const d = (action: ActivityAction, details: Record<string, unknown> = {}) =>
    describeActivity(entry('x', lead.id, '2026-11-03T10:00:00Z', action, details), names)

  it('describes each action', () => {
    expect(d('created')).toBe('created this')
    expect(d('deleted')).toBe('deleted this')
    expect(d('restored')).toBe('restored this')
    expect(d('status_changed', { from: 'open', to: 'fixed' })).toBe('marked Fixed, please re-check')
    expect(d('status_changed', { from: 'todo', to: 'in_progress' })).toBe('marked In progress')
    expect(d('status_changed', { from: 'todo', to: 'blocked', reason: 'Waiting on API' })).toBe(
      'marked Blocked: Waiting on API',
    )
    expect(d('file_added', { file_name: 'report.pdf' })).toBe('added file report.pdf')
    expect(d('file_removed', { file_name: 'report.pdf' })).toBe('removed file report.pdf')
    expect(d('checklist_added', { title: 'Check Safari' })).toBe('added “Check Safari” to the checklist')
    expect(d('checklist_renamed', { from: 'A', title: 'B' })).toBe('renamed “A” to “B”')
    expect(d('checklist_removed', { title: 'Check Safari' })).toBe('removed “Check Safari” from the checklist')
    expect(d('checklist_ticked', { title: 'Check Safari' })).toBe('ticked “Check Safari”')
    expect(d('checklist_unticked', { title: 'Check Safari' })).toBe('unticked “Check Safari”')
  })

  it('describes edits', () => {
    const edit = (fields: Record<string, unknown>) => d('edited', { fields })
    expect(edit({ deadline: { from: '2026-11-03', to: '2026-11-05' } })).toBe(
      'changed the deadline from Nov 3 to Nov 5',
    )
    expect(edit({ deadline: { from: null, to: '2026-11-05' } })).toBe('set the deadline to Nov 5')
    expect(edit({ deadline: { from: '2026-11-03', to: null } })).toBe('removed the deadline')
    expect(edit({ explanation: null })).toBe('edited the explanation')
    expect(edit({ title: { from: 'A', to: 'B' } })).toBe('changed the title from “A” to “B”')
    expect(edit({ assigned_to: { from: hedi.id, to: lead.id } })).toBe('changed the assignee from Hedi to Lead')
    expect(edit({ needs_review: { from: false, to: true } })).toBe('turned needs review on')
    expect(edit({ project_id: { from: 'a', to: 'b' } })).toBe('changed the project')
    expect(edit({ explanation: null, deadline: { from: '2026-11-03', to: '2026-11-05' } })).toBe(
      'edited the explanation, changed the deadline from Nov 3 to Nov 5',
    )
  })
})
