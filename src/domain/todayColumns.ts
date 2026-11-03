import type { Profile } from '../data/types'

/** Who gets a column on the Today screen: every member of the team, sorted by name (all are equals, so no role filter). */
export function todayColumns(profiles: Profile[]): Profile[] {
  return [...profiles].sort((a, b) => a.displayName.localeCompare(b.displayName))
}
