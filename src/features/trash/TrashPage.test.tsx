import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getMyProfile, listProfiles } from '../../data/profiles'
import { listTrash, restoreItem } from '../../data/trash'
import { hedi, khaushik, lead } from '../../test/factories'
import { auth } from '../../test/mockAuth'
import { renderApp } from '../../test/renderApp'

vi.mock('../../data/auth', () => import('../../test/mockAuth').then((m) => m.authModule))
vi.mock('../../data/profiles', () => import('../../test/mockData').then((m) => m.profilesModule))
vi.mock('../../data/projects', () => import('../../test/mockData').then((m) => m.projectsModule))
vi.mock('../../data/tasks', () => import('../../test/mockData').then((m) => m.tasksModule))
vi.mock('../../data/findings', () => import('../../test/mockData').then((m) => m.findingsModule))
vi.mock('../../data/comments', () => import('../../test/mockData').then((m) => m.commentsModule))
vi.mock('../../data/reads', () => import('../../test/mockData').then((m) => m.readsModule))
vi.mock('../../data/trash', () => import('../../test/mockData').then((m) => m.trashModule))

describe('TrashPage', () => {
  beforeEach(() => {
    auth.signedInAs(hedi.id)
    vi.mocked(getMyProfile).mockResolvedValue(hedi)
    vi.mocked(listProfiles).mockResolvedValue([hedi, khaushik, lead])
    vi.mocked(listTrash).mockResolvedValue([
      { type: 'task', id: 't1', title: 'Old task', deletedAt: '2026-11-02T15:05:00Z', deletedBy: khaushik.id },
      { type: 'project', id: 'p1', title: 'Old project', deletedAt: '2026-11-01T15:05:00Z', deletedBy: null },
    ])
    vi.mocked(restoreItem).mockResolvedValue(undefined)
  })

  it('lists deleted items with who/when', async () => {
    renderApp('/trash')
    expect(await screen.findByRole('heading', { level: 1, name: 'Trash' })).toBeInTheDocument()
    const row = (await screen.findByText('Old task')).closest('li')!
    expect(within(row).getByText('Task')).toBeInTheDocument()
    expect(row).toHaveTextContent('deleted by Khaushik · Nov 2, 9:05 AM')
    const other = screen.getByText('Old project').closest('li')!
    expect(within(other).getByText('Project')).toBeInTheDocument()
  })

  it('Restore calls restoreItem and removes the row', async () => {
    renderApp('/trash')
    const row = (await screen.findByText('Old task')).closest('li')!
    // After the restore the refetch no longer returns it.
    vi.mocked(listTrash).mockResolvedValue([
      { type: 'project', id: 'p1', title: 'Old project', deletedAt: '2026-11-01T15:05:00Z', deletedBy: null },
    ])
    await userEvent.click(within(row).getByRole('button', { name: 'Restore' }))
    expect(restoreItem).toHaveBeenCalledWith({ type: 'task', id: 't1' })
    await waitFor(() => expect(screen.queryByText('Old task')).not.toBeInTheDocument())
    expect(screen.getByText('Old project')).toBeInTheDocument()
  })

  it('has an empty state', async () => {
    vi.mocked(listTrash).mockResolvedValue([])
    renderApp('/trash')
    expect(await screen.findByText('Trash is empty.')).toBeInTheDocument()
  })
})
