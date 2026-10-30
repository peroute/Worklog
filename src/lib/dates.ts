// "Today" always means today in the team's timezone (spec §5), never the viewer's UTC day.
// Calendar dates are 'YYYY-MM-DD' strings — the same format Postgres `date` columns use.

export const TEAM_TIMEZONE = 'America/Chicago'

// en-CA formats as YYYY-MM-DD; Intl applies Central daylight-saving rules for us.
const teamDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TEAM_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const headingFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC', // the input is already a calendar date; don't shift it again
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})

/** Today's date in Central time, e.g. '2026-10-29'. */
export function todayInTeamTz(now: Date = new Date()): string {
  return teamDateFormat.format(now)
}

/** The Central calendar date of an ISO timestamp. */
export function toTeamDate(iso: string): string {
  return teamDateFormat.format(new Date(iso))
}

/** Calendar arithmetic on a 'YYYY-MM-DD' date (done at UTC midnight, so DST can't skew it). */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** e.g. 'Thu, Oct 29' */
export function formatDayHeading(date: string): string {
  return headingFormat.format(new Date(`${date}T00:00:00Z`))
}
