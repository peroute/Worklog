import type { Profile } from '../data/types'

/** Sentinel value for the assignee filter meaning "don't filter by assignee". */
export const ALL_ASSIGNEES = 'all'

/**
 * Which assignee the Tasks page starts filtered to: your own work.
 * While the profile is still loading we show everyone rather than an empty list.
 */
export function defaultAssigneeFilter(me: Profile | undefined): string {
  return me?.id ?? ALL_ASSIGNEES
}
