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
  const doneToday = makeTask({ title: 'done today', status: 'done', doneAt: '2026-10-30T03:00:00Z' })
  const doneEarlier = makeTask({ title: 'done earlier', status: 'done', doneAt: '2026-10-27T15:00:00Z' })
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
    expect(isOverdue(makeTask({ deadline: '2026-10-28', status: 'done' }), viewed)).toBe(false)
  })
})
