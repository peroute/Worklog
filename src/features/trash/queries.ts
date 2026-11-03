import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listTrash, restoreItem } from '../../data/trash'
import type { TrashItem } from '../../data/types'

export function useTrash() {
  return useQuery({ queryKey: ['trash'], queryFn: listTrash })
}

/** Everything a restored item can reappear in (or change the counts of). */
const VIEWS = ['trash', 'projects', 'tasks', 'findings', 'today', 'inbox', 'unseen', 'activity']

export function useRestoreItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ type, id }: Pick<TrashItem, 'type' | 'id'>) => restoreItem({ type, id }),
    onSuccess: () => Promise.all(VIEWS.map((key) => queryClient.invalidateQueries({ queryKey: [key] }))),
  })
}
