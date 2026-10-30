import { describe, expect, it } from 'vitest'
import { makeFinding } from '../test/factories'
import { groupFindingsByDate } from './groupFindings'

describe('groupFindingsByDate', () => {
  it('groups findings under day headings, newest day first', () => {
    const groups = groupFindingsByDate([
      makeFinding({ title: 'a', findingDate: '2026-10-28' }),
      makeFinding({ title: 'b', findingDate: '2026-10-29' }),
      makeFinding({ title: 'c', findingDate: '2026-10-28' }),
    ])
    expect(groups.map((g) => g.date)).toEqual(['2026-10-29', '2026-10-28'])
    expect(groups[1].findings.map((f) => f.title)).toEqual(['a', 'c'])
  })

  it('returns no groups for no findings', () => {
    expect(groupFindingsByDate([])).toEqual([])
  })
})
