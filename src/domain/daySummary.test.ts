import { describe, expect, it } from 'vitest'
import { hedi, khaushik, makeFinding, makeTask } from '../test/factories'
import { daySummary } from './daySummary'

const viewed = '2026-10-29'

describe('daySummary (Today summary strip)', () => {
  it('counts what waits for the lead, what needs a fix, overdue, and work finished that day', () => {
    const tasks = [
      makeTask({ assignedTo: hedi.id, deadline: '2026-10-28' }), // overdue
      makeTask({ assignedTo: khaushik.id, deadline: '2026-10-20' }), // overdue
      makeTask({ assignedTo: hedi.id, deadline: '2026-10-29' }), // due today: not overdue
      makeTask({ assignedTo: hedi.id, status: 'done', doneAt: '2026-10-30T03:00:00Z' }), // waiting + finished 22:00 Central Oct 29
      makeTask({ assignedTo: hedi.id, status: 'approved', doneAt: '2026-10-27T15:00:00Z' }), // finished another day
      makeTask({ assignedTo: hedi.id, status: 'fixed', doneAt: '2026-10-30T03:00:00Z' }), // waiting + finished that day
      makeTask({ assignedTo: hedi.id, status: 'needs_review', doneAt: '2026-10-30T03:00:00Z' }), // needs review
    ]
    const findings = [
      makeFinding({ status: 'open' }),
      makeFinding({ status: 'fixed' }),
      makeFinding({ status: 'needs_review' }),
      makeFinding({ status: 'closed' }),
    ]
    expect(daySummary(tasks, findings, viewed)).toEqual({ waitingForLead: 4, needsReview: 2, overdue: 2, done: 2 })
  })

  it('is all zeros for an empty day', () => {
    expect(daySummary([], [], viewed)).toEqual({ waitingForLead: 0, needsReview: 0, overdue: 0, done: 0 })
  })
})
