import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { deleteProject } from '../../data/projects'
import { useDeleteProject } from './queries'

vi.mock('../../data/projects', () => import('../../test/mockData').then((m) => m.projectsModule))

describe('useDeleteProject', () => {
  it('refreshes the trash (and unseen/activity) after deleting a project', async () => {
    vi.mocked(deleteProject).mockResolvedValue(undefined)
    const queryClient = new QueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(() => useDeleteProject(), { wrapper })
    act(() => result.current.mutate('p1'))

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const refreshed = invalidate.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey))
    expect(refreshed).toEqual(expect.arrayContaining(['["trash"]', '["unseen"]', '["activity"]', '["projects"]']))
  })
})
