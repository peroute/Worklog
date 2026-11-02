import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import {
  createFinding,
  deleteFinding,
  getFinding,
  listFindings,
  setFindingStatus,
  requestChangesFinding,
  updateFinding,
} from '../../data/findings'
import { deleteFindingImage, getFindingImagesFor, uploadFindingImages } from '../../data/images'
import type { FindingImage, FindingStatus, NewFinding } from '../../data/types'

type FindingFilter = Parameters<typeof listFindings>[0]

export function useFindings(filter: FindingFilter = {}) {
  return useQuery({ queryKey: ['findings', filter], queryFn: () => listFindings(filter) })
}

export function useFinding(id: string) {
  return useQuery({
    queryKey: ['findings', 'detail', id],
    queryFn: () => getFinding(id),
    // Signed screenshot URLs expire after 1 h; refetch before that so images never break.
    staleTime: 50 * 60 * 1000,
    refetchInterval: 50 * 60 * 1000,
  })
}

/**
 * Screenshots for a list of findings (project page "Show details"). Only runs when `enabled`,
 * so the compact list never pays for it; refetches before the 1 h signed URLs expire.
 */
export function useFindingImages(findingIds: string[], enabled: boolean) {
  return useQuery({
    queryKey: ['findings', 'images', [...findingIds].sort()],
    queryFn: () => getFindingImagesFor(findingIds),
    enabled: enabled && findingIds.length > 0,
    staleTime: 50 * 60 * 1000,
    refetchInterval: 50 * 60 * 1000,
  })
}

/** Everything that shows findings or their counts. */
function invalidateFindingViews(queryClient: QueryClient) {
  return Promise.all(
    [['findings'], ['projects'], ['today'], ['review'], ['comments']].map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  )
}

export function useCreateFinding() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ input, images }: { input: NewFinding; images: Blob[] }) => createFinding(input, images),
    onSuccess: () => invalidateFindingViews(queryClient),
  })
}

interface UpdateFindingArgs {
  id: string
  patch: Partial<NewFinding>
  removeImages: FindingImage[]
  newImages: Blob[]
  startPosition: number
}

/** Saves text changes, removes screenshots marked for removal, uploads new ones. */
export function useUpdateFinding() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch, removeImages, newImages, startPosition }: UpdateFindingArgs) => {
      const finding = await updateFinding(id, patch)
      for (const image of removeImages) await deleteFindingImage(image)
      const { failed } = await uploadFindingImages(id, newImages, startPosition)
      return { finding, failedUploads: failed }
    },
    onSuccess: () => invalidateFindingViews(queryClient),
  })
}

export function useSetFindingStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: FindingStatus }) => setFindingStatus(id, status),
    onSuccess: () => invalidateFindingViews(queryClient),
  })
}

export function useDeleteFinding() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteFinding(id),
    onSuccess: () => invalidateFindingViews(queryClient),
  })
}

/** Lead only: comment + changes_requested in one step. */
export function useRequestChangesFinding() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => requestChangesFinding(id, body),
    onSuccess: () => invalidateFindingViews(queryClient),
  })
}
