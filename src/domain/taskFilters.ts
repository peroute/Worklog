import type { Profile } from '../data/types'

/** Sentinel value for the assignee filter meaning "don't filter by assignee". */
export const ALL_ASSIGNEES = 'all'

/**
 * Which assignee the Tasks page starts filtered to.
 * Members land on their own work; the lead oversees the team, so they start on everyone.
 * While the profile is still loading we show everyone rather than an empty list.
 */
export function defaultAssigneeFilter(me: Profile | undefined): string {
  if (!me || me.role === 'lead') return ALL_ASSIGNEES
  return me.id
}
