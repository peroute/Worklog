import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import {
  deleteTaskAttachment,
  listTaskAttachments,
  uploadTaskAttachments,
  type PendingAttachment,
} from '../../data/taskAttachments'
import { createTask, deleteTask, getTask, listTasks, sendBackTask, setTaskStatus, updateTask } from '../../data/tasks'
import type { NewTask, TaskAttachment, TaskStatus } from '../../data/types'

type TaskFilter = Parameters<typeof listTasks>[0]

export function useTasks(filter: TaskFilter = {}, options: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: ['tasks', filter], queryFn: () => listTasks(filter), enabled: options.enabled ?? true })
}

export function useTask(id: string) {
  return useQuery({ queryKey: ['tasks', 'detail', id], queryFn: () => getTask(id) })
}

/**
 * A task's attachments. Key lives under ['tasks'] so every task mutation refreshes it.
 * Refetches before the 1 h signed URLs expire, so links never go dead on an open page.
 */
export function useTaskAttachments(taskId: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['tasks', 'attachments', taskId],
    queryFn: () => listTaskAttachments(taskId),
    enabled: (options.enabled ?? true) && Boolean(taskId),
    staleTime: 50 * 60 * 1000,
    refetchInterval: 50 * 60 * 1000,
  })
}

/** Everything that shows tasks or their counts. */
function invalidateTaskViews(queryClient: QueryClient) {
  return Promise.all(
    [['tasks'], ['projects'], ['today'], ['review'], ['comments']].map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  )
}

/** Saves the task first, then its attachments. A failed upload never loses the task. */
export function useCreateTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ input, attachments = [] }: { input: NewTask; attachments?: PendingAttachment[] }) => {
      const task = await createTask(input)
      const { failed } = await uploadTaskAttachments(task.id, attachments, 0)
      return { task, failedUploads: failed }
    },
    onSuccess: () => invalidateTaskViews(queryClient),
  })
}

interface UpdateTaskArgs {
  id: string
  patch: Partial<NewTask>
  removeAttachments?: TaskAttachment[]
  newAttachments?: PendingAttachment[]
  /** Position for the first new attachment (after the ones already saved). */
  startPosition?: number
}

/** Saves text changes, removes attachments marked for removal, uploads new ones. */
export function useUpdateTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch, removeAttachments = [], newAttachments = [], startPosition = 0 }: UpdateTaskArgs) => {
      const task = await updateTask(id, patch)
      // Remove before uploading, so freed slots count toward the 10-file limit.
      for (const attachment of removeAttachments) await deleteTaskAttachment(attachment)
      const { failed } = await uploadTaskAttachments(id, newAttachments, startPosition)
      return { task, failedUploads: failed }
    },
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

/** Lead only: comment + needs_review in one step. */
export function useSendBackTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => sendBackTask(id, body),
    onSuccess: () => invalidateTaskViews(queryClient),
  })
}
