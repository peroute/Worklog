import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addComment, listComments } from '../../data/comments'
import type { CommentTarget } from '../../data/types'

const key = (target: CommentTarget) => ['comments', 'findingId' in target ? target.findingId : target.taskId]

export function useComments(target: CommentTarget) {
  return useQuery({ queryKey: key(target), queryFn: () => listComments(target) })
}

export function useAddComment(target: CommentTarget) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: string) => addComment(target, body),
    // The thread, and the Review page's "latest comment" previews.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: key(target) }),
        queryClient.invalidateQueries({ queryKey: ['review'] }),
      ]),
  })
}
