import { describe, expect, it } from 'vitest'
import { addDays, formatDayHeading, TEAM_TIMEZONE, todayInTeamTz, toTeamDate } from './dates'

describe('dates (team timezone)', () => {
  it('uses Central time', () => {
    expect(TEAM_TIMEZONE).toBe('America/Chicago')
  })

  it('keeps a late-evening finding on that Central day, not the next UTC day', () => {
    // 04:30 UTC on Oct 30 = 23:30 CDT on Oct 29
    expect(todayInTeamTz(new Date('2026-10-30T04:30:00Z'))).toBe('2026-10-29')
  })

  it('handles the evening after daylight saving ends', () => {
    // 05:30 UTC on Nov 2 = 23:30 CST on Nov 1 (offset is now -6h, not -5h)
    expect(todayInTeamTz(new Date('2026-11-02T05:30:00Z'))).toBe('2026-11-01')
  })

  it('converts a timestamp to its Central date', () => {
    expect(toTeamDate('2026-10-30T03:00:00Z')).toBe('2026-10-29')
  })

  it('adds days across a month boundary', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31')
  })

  it('adds days across the DST change without drifting', () => {
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02')
  })

  it('formats a day heading', () => {
    expect(formatDayHeading('2026-10-29')).toBe('Thu, Oct 29')
  })
})
