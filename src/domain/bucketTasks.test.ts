import { describe, expect, it } from 'vitest'
import { hedi, khaushik, makeTask } from '../test/factories'
import { bucketTasks, isOverdue } from './bucketTasks'

const viewed = '2026-10-29'

describe('bucketTasks (Today column groups, spec §7.2)', () => {
  const overdue = makeTask({ title: 'overdue', deadline: '2026-10-28' })
  const dueToday = makeTask({ title: 'due today', deadline: '2026-10-29' })
  const upcoming = makeTask({ title: 'upcoming', deadline: '2026-11-05' })
  const noDeadline = makeTask({ title: 'no deadline' })
  // 03:00 UTC Oct 30 = 22:00 Central Oct 29 → completed on the viewed day
  const doneToday = makeTask({ title: 'done today', status: 'submitted', doneAt: '2026-10-30T03:00:00Z' })
  const doneEarlier = makeTask({ title: 'done earlier', status: 'submitted', doneAt: '2026-10-27T15:00:00Z' })
  const someoneElse = makeTask({ title: 'not mine', assignedTo: khaushik.id, deadline: '2026-10-28' })

  const buckets = bucketTasks(
    [overdue, dueToday, upcoming, noDeadline, doneToday, doneEarlier, someoneElse],
    hedi.id,
    viewed,
  )
  const titles = (tasks: { title: string }[]) => tasks.map((t) => t.title)

  it('puts overdue and due-today tasks in dueOrOverdue', () => {
    expect(titles(buckets.dueOrOverdue)).toEqual(['overdue', 'due today'])
  })

  it('puts future deadlines in upcoming', () => {
    expect(titles(buckets.upcoming)).toEqual(['upcoming'])
  })

  it('puts open tasks without a deadline in noDeadline', () => {
    expect(titles(buckets.noDeadline)).toEqual(['no deadline'])
  })

  it('counts a task as completed on the Central day it was finished', () => {
    expect(titles(buckets.completed)).toEqual(['done today'])
  })

  it('drops tasks finished on other days and tasks assigned to someone else', () => {
    const all = [...buckets.dueOrOverdue, ...buckets.upcoming, ...buckets.noDeadline, ...buckets.completed]
    expect(titles(all)).not.toContain('done earlier')
    expect(titles(all)).not.toContain('not mine')
  })
})

describe('isOverdue', () => {
  it('is overdue only when open and the deadline has passed', () => {
    expect(isOverdue(makeTask({ deadline: '2026-10-28' }), viewed)).toBe(true)
    expect(isOverdue(makeTask({ deadline: '2026-10-29' }), viewed)).toBe(false)
    expect(isOverdue(makeTask({ deadline: null }), viewed)).toBe(false)
    expect(isOverdue(makeTask({ deadline: '2026-10-28', status: 'submitted' }), viewed)).toBe(false)
  })
})

describe('bucketTasks with the review flow', () => {
  const finishedToday = '2026-10-30T03:00:00Z' // 22:00 Central on Oct 29
  const tasks = [
    makeTask({ title: 'sent back', status: 'changes_requested', doneAt: finishedToday }),
    makeTask({ title: 'waiting', status: 'submitted', doneAt: finishedToday }),
    makeTask({ title: 'resubmitted', status: 'resubmitted', doneAt: finishedToday }),
    makeTask({ title: 'approved', status: 'approved', doneAt: finishedToday }),
    makeTask({ title: 'sent back, someone else', status: 'changes_requested', assignedTo: khaushik.id }),
  ]
  const buckets = bucketTasks(tasks, hedi.id, '2026-10-29')

  it('puts sent-back tasks in their own group, not in any other', () => {
    expect(buckets.changesRequested.map((t) => t.title)).toEqual(['sent back'])
    expect(buckets.completed.map((t) => t.title)).not.toContain('sent back')
    expect(buckets.dueOrOverdue).toHaveLength(0)
  })

  it('counts submitted, resubmitted and approved work as completed on the day it was finished', () => {
    expect(buckets.completed.map((t) => t.title)).toEqual(['waiting', 'resubmitted', 'approved'])
  })
})

describe('bucketTasks with a start day', () => {
  const startsTomorrow = makeTask({ title: 'starts tomorrow', startDate: '2026-10-30' })
  const startsToday = makeTask({ title: 'starts today', startDate: '2026-10-29', deadline: '2026-11-05' })
  const started = makeTask({ title: 'started', startDate: '2026-10-20' })
  // Finished early (before its start day): still shows as completed on the day it was finished.
  const finishedEarly = makeTask({
    title: 'finished early',
    startDate: '2026-11-03',
    status: 'submitted',
    doneAt: '2026-10-29T15:00:00Z',
  })

  const buckets = bucketTasks([startsTomorrow, startsToday, started, finishedEarly], hedi.id, viewed)
  const all = Object.values(buckets).flat().map((t) => t.title)

  it('hides an open task until the viewed day reaches its start day', () => {
    expect(all).not.toContain('starts tomorrow')
  })

  it('shows a task from its start day on, grouped as usual', () => {
    expect(buckets.upcoming.map((t) => t.title)).toEqual(['starts today'])
    expect(buckets.noDeadline.map((t) => t.title)).toEqual(['started'])
  })

  it('still counts work finished before its start day as completed', () => {
    expect(buckets.completed.map((t) => t.title)).toEqual(['finished early'])
  })
})
