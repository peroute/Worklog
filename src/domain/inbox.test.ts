import { describe, expect, it } from 'vitest'
import type { Project } from '../data/types'
import { hedi, khaushik, lead, makeFinding, makeTask } from '../test/factories'
import { buildInbox, inboxCount } from './inbox'

const project: Project = {
  id: 'project-1',
  name: 'P',
  description: null,
  createdBy: lead.id,
  createdAt: '2026-10-01T00:00:00Z',
  deletedAt: null,
  deletedBy: null,
}
const profiles = [lead, hedi, khaushik]
const build = (
  me: typeof hedi,
  findings: ReturnType<typeof makeFinding>[] = [],
  tasks: ReturnType<typeof makeTask>[] = [],
) => buildInbox(me, { findings, tasks, projects: [project], profiles })

describe('buildInbox', () => {
  it('hedi needs: fixed finding he logged, in-progress task assigned to him (not khaushik\'s)', () => {
    const fixed = makeFinding({ id: 'f1', status: 'fixed', authorId: hedi.id, fixedBy: lead.id })
    const task = makeTask({ id: 't1', status: 'in_progress', assignedTo: hedi.id })
    const other = makeTask({ id: 't2', status: 'in_progress', assignedTo: khaushik.id })
    const inbox = build(hedi, [fixed], [task, other])
    expect(inbox.needsYou.findings.map((f) => f.id)).toEqual(['f1'])
    expect(inbox.needsYou.tasks.map((t) => t.id)).toEqual(['t1'])
  })

  it('creator sees handed-out task in waitingOnOthers', () => {
    const task = makeTask({ id: 't1', status: 'todo', createdBy: lead.id, assignedTo: hedi.id })
    const inbox = build(lead, [], [task])
    expect(inbox.waitingOnOthers.tasks.map((t) => t.id)).toEqual(['t1'])
    expect(inbox.needsYou.tasks).toEqual([])
  })

  it('author sees their open finding in waitingOnOthers', () => {
    const f = makeFinding({ id: 'f1', status: 'open', authorId: hedi.id }) // project creator = lead
    const inbox = build(hedi, [f])
    expect(inbox.waitingOnOthers.findings.map((x) => x.id)).toEqual(['f1'])
  })

  it('closed items appear nowhere', () => {
    const inbox = build(
      hedi,
      [makeFinding({ status: 'verified', authorId: hedi.id }), makeFinding({ status: 'not_a_bug', authorId: hedi.id })],
      [makeTask({ status: 'done', assignedTo: hedi.id, createdBy: hedi.id })],
    )
    expect(inbox.needsYou).toEqual({ findings: [], tasks: [] })
    expect(inbox.waitingOnOthers).toEqual({ findings: [], tasks: [] })
  })

  it('sorts oldest first', () => {
    const a = makeTask({ id: 'a', assignedTo: hedi.id, createdAt: '2026-10-22T00:00:00Z' })
    const b = makeTask({ id: 'b', assignedTo: hedi.id, createdAt: '2026-10-21T00:00:00Z' })
    expect(build(hedi, [], [a, b]).needsYou.tasks.map((t) => t.id)).toEqual(['b', 'a'])
  })

  it('count = needsYou only', () => {
    const inbox = build(
      hedi,
      [makeFinding({ status: 'fixed', authorId: hedi.id, fixedBy: lead.id })],
      [
        makeTask({ assignedTo: hedi.id }),
        makeTask({ assignedTo: khaushik.id, createdBy: hedi.id }), // waiting on others
      ],
    )
    expect(inbox.waitingOnOthers.tasks).toHaveLength(1)
    expect(inboxCount(inbox)).toBe(2)
  })
})
