import { useQuery } from '@tanstack/react-query'
import { listTasks } from '../../data/tasks'

type TaskFilter = Parameters<typeof listTasks>[0]

/** Tasks list. Mutation hooks for tasks are added in Task 10. */
export function useTasks(filter: TaskFilter = {}) {
  return useQuery({ queryKey: ['tasks', filter], queryFn: () => listTasks(filter) })
}
