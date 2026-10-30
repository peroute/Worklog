import { useQuery } from '@tanstack/react-query'
import { listFindings } from '../../data/findings'
import { listProfiles } from '../../data/profiles'
import { listProjects } from '../../data/projects'
import { listTasks } from '../../data/tasks'

/**
 * Everything the Today screen needs for one day, fetched in parallel under ['today', date].
 * Tasks are all tasks (bucketing decides what shows); findings are just that day's.
 * Every finding/task/project mutation invalidates ['today'], so this refreshes itself.
 */
export function useToday(date: string) {
  return useQuery({
    queryKey: ['today', date],
    queryFn: async () => {
      const [profiles, tasks, findings, projects] = await Promise.all([
        listProfiles(),
        listTasks(),
        listFindings({ date }),
        listProjects(),
      ])
      return { profiles, tasks, findings, projects }
    },
  })
}
