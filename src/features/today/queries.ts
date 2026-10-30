import { useQuery } from '@tanstack/react-query'
import { listFindings } from '../../data/findings'
import { listProfiles } from '../../data/profiles'
import { listProjects } from '../../data/projects'
import { listTasks } from '../../data/tasks'

/**
 * Everything the Today screen needs for one day, fetched in parallel under ['today', date].
 * Tasks and findings are ALL of them: the summary strip counts everything waiting in the
 * review loop; the page itself shows only the viewed day's findings.
 * Every finding/task/project mutation invalidates ['today'], so this refreshes itself.
 */
export function useToday(date: string) {
  return useQuery({
    queryKey: ['today', date],
    queryFn: async () => {
      const [profiles, tasks, findings, projects] = await Promise.all([
        listProfiles(),
        listTasks(),
        listFindings(),
        listProjects(),
      ])
      return { profiles, tasks, findings, projects }
    },
  })
}
