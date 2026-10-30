import { describe, expect, it } from 'vitest'
import { hedi, khaushik, lead, makeFinding, makeTask } from '../test/factories'
import { reviewBadgeCount, reviewQueues } from './review'

const findings = [
  makeFinding({ title: 'hedi open', authorId: hedi.id, status: 'open', createdAt: '2026-10-29T10:00:00Z' }),
  makeFinding({ title: 'hedi fixed', authorId: hedi.id, status: 'fixed', createdAt: '2026-10-28T10:00:00Z' }),
  makeFinding({ title: 'hedi to fix', authorId: hedi.id, status: 'needs_review' }),
  makeFinding({ title: 'hedi closed', authorId: hedi.id, status: 'closed' }),
  makeFinding({ title: 'khaushik to fix', authorId: khaushik.id, status: 'needs_review' }),
  makeFinding({ title: 'lead own open', authorId: lead.id, status: 'open' }),
]
const tasks = [
  makeTask({ title: 'hedi done', assignedTo: hedi.id, status: 'done' }),
  makeTask({ title: 'hedi to fix', assignedTo: hedi.id, status: 'needs_review' }),
  makeTask({ title: 'hedi todo', assignedTo: hedi.id, status: 'todo' }),
  makeTask({ title: 'khaushik fixed', assignedTo: khaushik.id, status: 'fixed' }),
  makeTask({ title: 'lead own done', assignedTo: lead.id, status: 'done' }),
]
const titles = (items: { title: string }[]) => items.map((i) => i.title)

describe('reviewQueues', () => {
  it('gives the lead everything waiting for them, oldest first, without their own work', () => {
    const q = reviewQueues(lead, findings, tasks)
    if (q.kind !== 'lead') throw new Error('expected lead queue')
    expect(titles(q.waiting.findings)).toEqual(['hedi fixed', 'hedi open'])
    expect(titles(q.waiting.tasks).sort()).toEqual(['hedi done', 'khaushik fixed'])
  })

  it('gives a member what they must fix, and what is waiting on the lead', () => {
    const q = reviewQueues(hedi, findings, tasks)
    if (q.kind !== 'member') throw new Error('expected member queue')
    expect(titles(q.toFix.findings)).toEqual(['hedi to fix'])
    expect(titles(q.toFix.tasks)).toEqual(['hedi to fix'])
    expect(titles(q.waitingOnLead.findings).sort()).toEqual(['hedi fixed', 'hedi open'])
    expect(titles(q.waitingOnLead.tasks)).toEqual(['hedi done'])
  })
})

describe('reviewBadgeCount', () => {
  it('counts what needs the viewer to act', () => {
    expect(reviewBadgeCount(lead, findings, tasks)).toBe(4)
    expect(reviewBadgeCount(hedi, findings, tasks)).toBe(2)
    expect(reviewBadgeCount(khaushik, findings, tasks)).toBe(1)
  })
})
