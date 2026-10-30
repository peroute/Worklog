import { describe, expect, it } from 'vitest'
import { hedi, khaushik, makeFinding, makeTask } from '../test/factories'
import { daySummary } from './daySummary'

const viewed = '2026-10-29'

describe('daySummary (Today summary strip)', () => {
  it("counts the team's open findings, overdue tasks and tasks done that day", () => {
    const tasks = [
      makeTask({ assignedTo: hedi.id, deadline: '2026-10-28' }), // overdue
      makeTask({ assignedTo: khaushik.id, deadline: '2026-10-20' }), // overdue
      makeTask({ assignedTo: hedi.id, deadline: '2026-10-29' }), // due today: not overdue
      makeTask({ assignedTo: hedi.id, status: 'done', doneAt: '2026-10-30T03:00:00Z' }), // done 22:00 Central Oct 29
      makeTask({ assignedTo: hedi.id, status: 'done', doneAt: '2026-10-27T15:00:00Z' }), // done another day
      makeTask({ assignedTo: hedi.id, status: 'done', deadline: '2026-10-01', doneAt: '2026-10-30T03:00:00Z' }), // late but done
    ]
    const findings = [
      makeFinding({ status: 'open' }),
      makeFinding({ status: 'open' }),
      makeFinding({ status: 'closed' }),
    ]
    expect(daySummary(tasks, findings, viewed)).toEqual({ openFindings: 2, overdue: 2, done: 2 })
  })

  it('is all zeros for an empty day', () => {
    expect(daySummary([], [], viewed)).toEqual({ openFindings: 0, overdue: 0, done: 0 })
  })
})
