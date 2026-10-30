import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createProject,
  deleteProject,
  getProject,
  getProjectDeleteCounts,
  listProjects,
  updateProject,
} from '../../data/projects'

// Query keys: ['projects'] is the list; ['projects', id, ...] are per-project.
// Invalidating ['projects'] refreshes all of them (keys match by prefix).

export function useProjects() {
  return useQuery({ queryKey: ['projects'], queryFn: listProjects })
}

export function useProject(id: string, options: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: ['projects', id], queryFn: () => getProject(id), enabled: options.enabled ?? true })
}

export function useProjectDeleteCounts(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ['projects', id, 'deleteCounts'],
    queryFn: () => getProjectDeleteCounts(id),
    enabled,
    staleTime: 0, // always count fresh right before a delete
  })
}

export function useCreateProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: Parameters<typeof createProject>[0]) => createProject(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useUpdateProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updateProject>[1] }) => updateProject(id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useDeleteProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteProject(id),
    // A project delete removes tasks and findings too, so refresh everything that lists them.
    onSuccess: async () => {
      await Promise.all(
        [['projects'], ['tasks'], ['findings'], ['today'], ['review']].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      )
    },
  })
}
