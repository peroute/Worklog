import { useQuery } from '@tanstack/react-query'
import { listLatestComments } from '../../data/comments'
import type { Profile } from '../../data/types'
import { reviewBadgeCount } from '../../domain/review'
import { useFindings } from '../findings/queries'
import { useTasks } from '../tasks/queries'

/**
 * Latest comment for every item currently in the review loop (Review page previews).
 * Keyed under ['review'] so status changes and new comments refresh it.
 */
export function useLatestReviewComments(findingIds: string[], taskIds: string[]) {
  return useQuery({
    queryKey: ['review', 'latestComments', [...findingIds].sort(), [...taskIds].sort()],
    queryFn: () => listLatestComments({ findingIds, taskIds }),
    enabled: findingIds.length + taskIds.length > 0,
  })
}

/** Nav badge: items that need `me` to act. Reuses the cached all-findings / all-tasks lists. */
export function useReviewCount(me: Profile | undefined): number {
  const findings = useFindings({})
  const tasks = useTasks({})
  if (!me || !findings.data || !tasks.data) return 0
  return reviewBadgeCount(me, findings.data, tasks.data)
}
