import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { listLatestComments } from '../../data/comments'
import { buildInbox, inboxCount } from '../../domain/inbox'
import { useMe } from '../auth/useMe'
import { useFindings } from '../findings/queries'
import { useProjects } from '../projects/queries'
import { useTasks } from '../tasks/queries'
import { useProfiles } from '../team/queries'

/**
 * The one place the inbox is computed. The Inbox page and the nav badge both call this, so the badge number
 * is always the length of the page's "Needs you" section (it reuses the cached lists, no extra requests).
 */
export function useInbox() {
  const { me, error: meError } = useMe()
  const findings = useFindings({})
  const tasks = useTasks({})
  const projects = useProjects()
  const profiles = useProfiles()

  const inbox = useMemo(
    () =>
      me && findings.data && tasks.data && projects.data && profiles.data
        ? buildInbox(me, {
            findings: findings.data,
            tasks: tasks.data,
            projects: projects.data,
            profiles: profiles.data,
          })
        : undefined,
    [me, findings.data, tasks.data, projects.data, profiles.data],
  )
  const failed = [findings, tasks, projects, profiles].find((q) => q.isError)
  const error = meError ?? failed?.error ?? null
  return {
    inbox,
    count: inbox ? inboxCount(inbox) : 0,
    isPending: !inbox && !error,
    error,
    profiles: profiles.data,
    projects: projects.data,
  }
}

/** Latest comment per inbox item (row previews). Keyed under ['inbox'] so new comments and status moves refresh it. */
export function useLatestInboxComments(findingIds: string[], taskIds: string[]) {
  return useQuery({
    queryKey: ['inbox', 'latestComments', [...findingIds].sort(), [...taskIds].sort()],
    queryFn: () => listLatestComments({ findingIds, taskIds }),
    enabled: findingIds.length + taskIds.length > 0,
  })
}
