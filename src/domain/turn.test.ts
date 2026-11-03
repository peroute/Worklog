import { describe, expect, it } from 'vitest'
import type { Project } from '../data/types'
import { hedi, khaushik, lead, makeFinding, makeTask } from '../test/factories'
import { whoseTurnFinding, whoseTurnTask } from './turn'

const profiles = [lead, hedi, khaushik]
const project: Project = {
  id: 'project-1',
  name: 'P',
  description: null,
  createdBy: khaushik.id,
  createdAt: '2026-10-01T00:00:00Z',
  deletedAt: null,
  deletedBy: null,
}
const ctxWith = (tasks: ReturnType<typeof makeTask>[] = []) => ({ tasks, projects: [project], profiles })

describe('whoseTurnFinding', () => {
  it("open finding under lead's task → lead", () => {
    const task = makeTask({ id: 't1', createdBy: lead.id })
    const f = makeFinding({ taskId: 't1', authorId: hedi.id })
    expect(whoseTurnFinding(f, ctxWith([task]))).toEqual([lead.id])
  })

  it('open finding without task → project creator', () => {
    const f = makeFinding({ taskId: null, authorId: hedi.id })
    expect(whoseTurnFinding(f, ctxWith())).toEqual([khaushik.id])
  })

  it('lead logs under own task → hedi and khaushik', () => {
    const task = makeTask({ id: 't1', createdBy: lead.id })
    const f = makeFinding({ taskId: 't1', authorId: lead.id })
    expect(whoseTurnFinding(f, ctxWith([task])).sort()).toEqual([hedi.id, khaushik.id].sort())
  })

  it('author marked own finding fixed → everyone else', () => {
    const f = makeFinding({ status: 'fixed', authorId: hedi.id, fixedBy: hedi.id })
    expect(whoseTurnFinding(f, ctxWith()).sort()).toEqual([lead.id, khaushik.id].sort())
  })

  it('needs_info and fixed → author; closed → nobody', () => {
    expect(whoseTurnFinding(makeFinding({ status: 'needs_info', authorId: hedi.id }), ctxWith())).toEqual([hedi.id])
    expect(whoseTurnFinding(makeFinding({ status: 'fixed', authorId: hedi.id }), ctxWith())).toEqual([hedi.id])
    expect(whoseTurnFinding(makeFinding({ status: 'verified' }), ctxWith())).toEqual([])
    expect(whoseTurnFinding(makeFinding({ status: 'not_a_bug' }), ctxWith())).toEqual([])
  })
})

describe('whoseTurnTask', () => {
  it('todo / in_progress / blocked → assignee', () => {
    for (const status of ['todo', 'in_progress', 'blocked'] as const) {
      expect(whoseTurnTask(makeTask({ status, assignedTo: hedi.id }), profiles)).toEqual([hedi.id])
    }
  })

  it('waiting task handed out → creator', () => {
    const t = makeTask({ status: 'waiting_for_review', createdBy: lead.id, assignedTo: hedi.id })
    expect(whoseTurnTask(t, profiles)).toEqual([lead.id])
  })

  it('self-created waiting task → everyone but assignee', () => {
    const t = makeTask({ status: 'waiting_for_review', createdBy: hedi.id, assignedTo: hedi.id })
    expect(whoseTurnTask(t, profiles).sort()).toEqual([lead.id, khaushik.id].sort())
  })

  it('creator submitted a handed-out task → everyone but the creator', () => {
    const t = makeTask({
      status: 'waiting_for_review',
      createdBy: lead.id,
      assignedTo: hedi.id,
      submittedBy: lead.id,
    })
    expect(whoseTurnTask(t, profiles).sort()).toEqual([hedi.id, khaushik.id].sort())
  })

  it('assignee submitted a handed-out task → creator', () => {
    const t = makeTask({
      status: 'waiting_for_review',
      createdBy: lead.id,
      assignedTo: hedi.id,
      submittedBy: hedi.id,
    })
    expect(whoseTurnTask(t, profiles)).toEqual([lead.id])
  })

  it('done → nobody', () => {
    expect(whoseTurnTask(makeTask({ status: 'done' }), profiles)).toEqual([])
  })
})
