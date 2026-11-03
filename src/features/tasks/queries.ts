import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import {
  deleteTaskAttachment,
  listTaskAttachments,
  uploadTaskAttachments,
  type PendingAttachment,
} from '../../data/taskAttachments'
import { prepareAttachment } from './prepareAttachment'
import {
  addChecklistItems,
  listChecklist,
  removeChecklistItems,
  renameChecklistItem,
  setChecklistPositions,
} from '../../data/checklist'
import { diffChecklist, planChecklistSave, type DraftItem } from '../../domain/checklist'
import {
  createTask,
  deleteTask,
  getTask,
  listTasks,
  setTaskStatus,
  updateTask,
} from '../../data/tasks'
import type { AttachmentKind, ChecklistItem, NewTask, TaskAttachment, TaskStatus } from '../../data/types'

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

/** Everything that shows tasks or their counts (checklist changes use it too). */
export function invalidateTaskViews(queryClient: QueryClient) {
  return Promise.all(
    [['tasks'], ['projects'], ['today'], ['review'], ['comments'], ['activity'], ['trash']].map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  )
}

/**
 * Runs checklist writes after the task is saved. Returns the error message instead of throwing,
 * so the form sends the user to the saved task (with a warning) rather than inviting a second,
 * duplicate save. null = everything saved.
 */
async function saveChecklist(write: () => Promise<unknown>): Promise<string | null> {
  try {
    await write()
    return null
  } catch (error) {
    return error instanceof Error ? error.message : 'Could not save the checklist'
  }
}

/** Saves the task first, then its checklist and attachments. A failure after that never loses the task. */
export function useCreateTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      input,
      attachments = [],
      checklist = [],
    }: {
      input: NewTask
      attachments?: PendingAttachment[]
      checklist?: DraftItem[]
    }) => {
      const task = await createTask(input)
      const checklistError = await saveChecklist(() =>
        addChecklistItems(task.id, diffChecklist([], checklist).add),
      )
      const { failed } = await uploadTaskAttachments(task.id, attachments, 0)
      return { task, failedUploads: failed, checklistError }
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
  /** The list as it was when the form opened, and the edited list. Omit to leave the checklist alone. */
  checklist?: { atOpen: ChecklistItem[]; draft: DraftItem[] }
}

/** Saves text changes, removes attachments marked for removal, uploads new ones. */
export function useUpdateTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      patch,
      removeAttachments = [],
      newAttachments = [],
      startPosition = 0,
      checklist,
    }: UpdateTaskArgs) => {
      const task = await updateTask(id, patch)
      // Remove first so freed slots count toward the 50-item limit, then rename, reorder, add.
      const checklistError = checklist
        ? await saveChecklist(async () => {
            // Others may have changed the list since the form opened: write against what's there now.
            const current = await listChecklist(id)
            const ops = planChecklistSave(checklist.atOpen, current, checklist.draft)
            await removeChecklistItems(ops.remove)
            for (const { id: itemId, title } of ops.rename) await renameChecklistItem(itemId, title)
            await setChecklistPositions(ops.reposition)
            await addChecklistItems(id, ops.add)
          })
        : null
      // Remove before uploading, so freed slots count toward the 10-file limit.
      for (const attachment of removeAttachments) await deleteTaskAttachment(attachment)
      const { failed } = await uploadTaskAttachments(id, newAttachments, startPosition)
      return { task, failedUploads: failed, checklistError }
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

interface SubmitWorkArgs {
  note: string | null
  files: File[]
  /** Position for the first new file (after the ones already saved). */
  startPosition: number
  /** Status to move to, or null to only save the note/files (editing a submission). */
  to: TaskStatus | null
}

/**
 * Hands in work: proof files first, then the note (and the status move, if any) in one call.
 * If any file fails, we stop BEFORE changing the status, so nobody reviews a half-uploaded
 * submission. Files that did upload stay saved and show on retry.
 */
export function useSubmitWork(taskId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ note, files, startPosition, to }: SubmitWorkArgs) => {
      const prepared = await Promise.all(files.map((file) => prepareAttachment(file)))
      const { failed } = await uploadTaskAttachments(taskId, prepared, startPosition, 'proof')
      if (failed > 0) {
        throw new Error(`${failed} file(s) failed to upload, so nothing was submitted. Try again.`)
      }
      // The note rides along with the status move so both land or neither does.
      if (to) await setTaskStatus(taskId, to, note ? { note } : {})
      else await updateTask(taskId, { submissionNote: note })
    },
    // Invalidate on failure too: some files may have uploaded before one failed.
    onSettled: () => invalidateTaskViews(queryClient),
  })
}

/** Adds files of one kind to an existing task. Positions continue after the highest saved one. */
export function useAddTaskAttachments(taskId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ files, startPosition, kind }: { files: File[]; startPosition: number; kind: AttachmentKind }) => {
      const prepared = await Promise.all(files.map((file) => prepareAttachment(file)))
      return uploadTaskAttachments(taskId, prepared, startPosition, kind)
    },
    onSuccess: () => invalidateTaskViews(queryClient),
  })
}

export function useRemoveTaskAttachment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (attachment: TaskAttachment) => deleteTaskAttachment(attachment),
    onSuccess: () => invalidateTaskViews(queryClient),
  })
}
