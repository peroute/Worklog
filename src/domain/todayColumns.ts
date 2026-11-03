import type { Finding, Profile, Task } from '../data/types'

/**
 * Who gets a column on the Today screen: every member of the team, sorted by name (all three are equals,
 * so there is no role filter). The task/finding/date arguments are kept so callers don't change.
 */
export function todayColumns(
  profiles: Profile[],
  _tasks: Task[],
  _findings: Finding[],
  _viewedDate: string,
): Profile[] {
  return [...profiles].sort((a, b) => a.displayName.localeCompare(b.displayName))
}
