import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { listChecklist, setChecklistItemDone } from '../../data/checklist'
import { makeChecklistItem } from '../../test/factories'
import { useChecklist, useToggleChecklistItem } from './checklistQueries'

vi.mock('../../data/checklist', () => import('../../test/mockData').then((m) => m.checklistModule))
vi.mock('../../data/tasks', () => import('../../test/mockData').then((m) => m.tasksModule))

describe('checklist mutations', () => {
  // Today's rows are cached under ['today'], not ['tasks']; stale counts there would let the
  // row's quick-submit skip the "unticked items" warning.
  it('refresh every view that shows checklist counts, including Today', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    vi.mocked(setChecklistItemDone).mockResolvedValue(makeChecklistItem({ done: true }))
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(() => useToggleChecklistItem('t1'), { wrapper })
    act(() => result.current.mutate({ id: 'i1', done: true }))

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const refreshed = invalidate.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey))
    expect(refreshed).toEqual(expect.arrayContaining(['["tasks"]', '["today"]', '["projects"]', '["inbox"]']))
  })

  // Ticking A then B quickly: if A's refetch ran while B was still saving, the server's answer
  // (B not ticked yet) would flip B's box back off, and a second click would untick it.
  it('waits for the last tick to finish before refetching, so quick ticks never flip back', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const items = [makeChecklistItem({ id: 'a', taskId: 't1' }), makeChecklistItem({ id: 'b', taskId: 't1' })]
    vi.mocked(listChecklist).mockResolvedValue(items) // the server hasn't seen any tick yet
    const pending: Record<string, () => void> = {}
    vi.mocked(setChecklistItemDone).mockImplementation(
      (id) => new Promise((resolve) => (pending[id] = () => resolve(makeChecklistItem({ id, done: true })))),
    )
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => ({ list: useChecklist('t1'), toggle: useToggleChecklistItem('t1') }), { wrapper })
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))

    act(() => result.current.toggle.mutate({ id: 'a', done: true }))
    act(() => result.current.toggle.mutate({ id: 'b', done: true }))
    await waitFor(() => expect(Object.keys(pending)).toHaveLength(2))
    const fetchesBefore = vi.mocked(listChecklist).mock.calls.length

    await act(async () => pending.a()) // A finishes while B is still saving
    await new Promise((r) => setTimeout(r, 20))
    expect(vi.mocked(listChecklist).mock.calls.length).toBe(fetchesBefore)
    expect(result.current.list.data?.find((i) => i.id === 'b')?.done).toBe(true)
  })
})
