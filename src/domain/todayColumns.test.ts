import { describe, expect, it } from 'vitest'
import { hedi, khaushik, lead, makeFinding, makeTask } from '../test/factories'
import { todayColumns } from './todayColumns'

const viewed = '2026-10-29'
const names = (people: { displayName: string }[]) => people.map((p) => p.displayName)

describe('todayColumns', () => {
  it('always shows members, sorted by name, and hides an idle lead', () => {
    expect(names(todayColumns([lead, khaushik, hedi], [], [], viewed))).toEqual(['Hedi', 'Khaushik'])
  })

  it('adds the lead when they have an open task', () => {
    const tasks = [makeTask({ assignedTo: lead.id })]
    expect(names(todayColumns([lead, khaushik, hedi], tasks, [], viewed))).toEqual(['Hedi', 'Khaushik', 'Lead'])
  })

  it('adds the lead when they logged a finding that day', () => {
    const findings = [makeFinding({ authorId: lead.id, findingDate: viewed })]
    expect(names(todayColumns([lead, khaushik, hedi], [], findings, viewed))).toEqual(['Hedi', 'Khaushik', 'Lead'])
  })

  it('ignores the lead\'s done tasks and other days\' findings', () => {
    const tasks = [makeTask({ assignedTo: lead.id, status: 'done', doneAt: '2026-10-20T15:00:00Z' })]
    const findings = [makeFinding({ authorId: lead.id, findingDate: '2026-10-28' })]
    expect(names(todayColumns([lead, khaushik, hedi], tasks, findings, viewed))).toEqual(['Hedi', 'Khaushik'])
  })
})
