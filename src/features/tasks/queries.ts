import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { createTask, deleteTask, listTasks, setTaskStatus, updateTask } from '../../data/tasks'
import type { NewTask, TaskStatus } from '../../data/types'

type TaskFilter = Parameters<typeof listTasks>[0]

export function useTasks(filter: TaskFilter = {}, options: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: ['tasks', filter], queryFn: () => listTasks(filter), enabled: options.enabled ?? true })
}

/** Everything that shows tasks or their counts. */
function invalidateTaskViews(queryClient: QueryClient) {
  return Promise.all([['tasks'], ['projects'], ['today']].map((queryKey) => queryClient.invalidateQueries({ queryKey })))
}

export function useCreateTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: NewTask) => createTask(input),
    onSuccess: () => invalidateTaskViews(queryClient),
  })
}

export function useUpdateTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<NewTask> }) => updateTask(id, patch),
    onSuccess: () => invalidateTaskViews(queryClient),
  })
}

export function useSetTaskStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) => setTaskStatus(id, status),
    onSuccess: () => invalidateTaskViews(queryClient),
  })
}

export function useDeleteTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteTask(id),
    onSuccess: () => invalidateTaskViews(queryClient),
  })
}
