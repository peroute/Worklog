import { describe, expect, it } from 'vitest'
import { hedi, khaushik, makeFinding, makeTask } from '../test/factories'
import { daySummary } from './daySummary'

const viewed = '2026-10-29'

describe('daySummary (Today summary strip)', () => {
  it('counts waiting for review, blocked, overdue, and work finished that day', () => {
    const tasks = [
      makeTask({ assignedTo: hedi.id, deadline: '2026-10-28' }), // overdue
      makeTask({ assignedTo: khaushik.id, deadline: '2026-10-20', status: 'in_progress' }), // overdue
      makeTask({ assignedTo: hedi.id, deadline: '2026-10-29' }), // due today: not overdue
      makeTask({ assignedTo: hedi.id, status: 'waiting_for_review', doneAt: '2026-10-30T03:00:00Z' }), // waiting + finished 22:00 Central Oct 29
      makeTask({ assignedTo: hedi.id, status: 'done', doneAt: '2026-10-27T15:00:00Z' }), // finished another day
      makeTask({ assignedTo: hedi.id, status: 'done', doneAt: '2026-10-30T03:00:00Z' }), // finished that day
      makeTask({ assignedTo: hedi.id, status: 'blocked', deadline: '2026-10-01' }), // blocked + overdue
    ]
    const findings = [
      makeFinding({ status: 'fixed' }),
      makeFinding({ status: 'open' }),
      makeFinding({ status: 'verified' }),
    ]
    expect(daySummary(tasks, findings, viewed)).toEqual({ waitingForReview: 2, blocked: 1, overdue: 3, done: 2 })
  })

  it('is all zeros for an empty day', () => {
    expect(daySummary([], [], viewed)).toEqual({ waitingForReview: 0, blocked: 0, overdue: 0, done: 0 })
  })
})
