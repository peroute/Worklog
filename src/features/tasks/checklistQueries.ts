import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addChecklistItems,
  listChecklist,
  removeChecklistItems,
  setChecklistItemDone,
  setChecklistPositions,
} from '../../data/checklist'
import type { ChecklistItem } from '../../data/types'
import { invalidateTaskViews } from './queries'

/** Lives under ['tasks'] so every task mutation (and ours) also refreshes the "2/5" counts. */
const checklistKey = (taskId: string) => ['tasks', 'checklist', taskId]

export function useChecklist(taskId: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: checklistKey(taskId),
    queryFn: () => listChecklist(taskId),
    enabled: (options.enabled ?? true) && Boolean(taskId),
  })
}

/**
 * After any checklist change: refetch the list and every view that shows "2/5" counts.
 * Today's rows are cached under ['today'], so refreshing ['tasks'] alone would leave them stale.
 */
function useRefreshTasks() {
  const queryClient = useQueryClient()
  return () => invalidateTaskViews(queryClient)
}

/**
 * Optimistic: the box flips immediately; if the database refuses, just that box flips back.
 * The refetch afterwards brings in done_by / done_at, which only the database sets. It waits for
 * the last tick in flight: refetching while another tick is still saving would briefly un-tick
 * that box (the server hasn't seen it yet), and a second click would then really un-tick it.
 */
export function useToggleChecklistItem(taskId: string) {
  const queryClient = useQueryClient()
  const refresh = useRefreshTasks()
  const mutationKey = ['checklist-toggle', taskId]
  const setDone = (id: string, done: boolean) =>
    queryClient.setQueryData<ChecklistItem[]>(checklistKey(taskId), (items) =>
      items?.map((item) => (item.id === id ? { ...item, done } : item)),
    )
  return useMutation({
    mutationKey,
    mutationFn: ({ id, done }: { id: string; done: boolean }) => setChecklistItemDone(id, done),
    onMutate: async ({ id, done }) => {
      await queryClient.cancelQueries({ queryKey: checklistKey(taskId) }) // don't let an older fetch overwrite us
      setDone(id, done)
    },
    onError: (_error, { id, done }) => setDone(id, !done),
    onSettled: () => {
      // This mutation still counts as running here, so 1 = "I'm the last one".
      if (queryClient.isMutating({ mutationKey }) === 1) return refresh()
    },
  })
}

export function useAddChecklistItem(taskId: string) {
  const queryClient = useQueryClient()
  const refresh = useRefreshTasks()
  return useMutation({
    mutationFn: (title: string) => {
      const items = queryClient.getQueryData<ChecklistItem[]>(checklistKey(taskId)) ?? []
      const position = items.length ? Math.max(...items.map((i) => i.position)) + 1 : 0
      return addChecklistItems(taskId, [{ title, position }])
    },
    onSettled: refresh,
  })
}

export function useRemoveChecklistItem() {
  const refresh = useRefreshTasks()
  return useMutation({ mutationFn: (id: string) => removeChecklistItems([id]), onSettled: refresh })
}

/** Moves one item a step and renumbers the list 0..n, saving only positions that changed. */
export function useMoveChecklistItem(taskId: string) {
  const queryClient = useQueryClient()
  const refresh = useRefreshTasks()
  return useMutation({
    mutationFn: ({ id, direction }: { id: string; direction: 'up' | 'down' }) => {
      const items = [...(queryClient.getQueryData<ChecklistItem[]>(checklistKey(taskId)) ?? [])]
      const from = items.findIndex((i) => i.id === id)
      const to = direction === 'up' ? from - 1 : from + 1
      if (from < 0 || to < 0 || to >= items.length) return Promise.resolve()
      ;[items[from], items[to]] = [items[to], items[from]]
      const changed = items.flatMap((item, position) => (item.position === position ? [] : [{ id: item.id, position }]))
      return setChecklistPositions(changed)
    },
    onSettled: refresh,
  })
}
