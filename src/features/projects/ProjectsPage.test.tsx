import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DataError } from '../../data/errors'
import { getMyProfile, listProfiles } from '../../data/profiles'
import { createProject, listProjects } from '../../data/projects'
import { hedi, lead } from '../../test/factories'
import { auth } from '../../test/mockAuth'
import { renderApp } from '../../test/renderApp'

vi.mock('../../data/auth', () => import('../../test/mockAuth').then((m) => m.authModule))
vi.mock('../../data/profiles', () => ({ getMyProfile: vi.fn(), listProfiles: vi.fn() }))
vi.mock('../../data/projects', () => ({
  listProjects: vi.fn(),
  getProject: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  getProjectDeleteCounts: vi.fn(),
  deleteProject: vi.fn(),
}))

describe('ProjectsPage', () => {
  beforeEach(() => {
    auth.signedInAs(hedi.id)
    vi.mocked(getMyProfile).mockResolvedValue(hedi)
    vi.mocked(listProfiles).mockResolvedValue([hedi, lead])
  })

  it('shows an empty state when there are no projects', async () => {
    vi.mocked(listProjects).mockResolvedValue([])
    renderApp('/projects')
    expect(await screen.findByText('No projects yet — create the first one.')).toBeInTheDocument()
  })

  it('lists projects with their open counts', async () => {
    vi.mocked(listProjects).mockResolvedValue([
      { id: 'p1', name: 'Mobile App QA', description: 'Android', createdBy: lead.id, createdAt: '', openFindings: 4, openTasks: 2 },
    ])
    renderApp('/projects')
    const link = await screen.findByRole('link', { name: /Mobile App QA/ })
    expect(link).toHaveAttribute('href', '/projects/p1')
    expect(link).toHaveTextContent('4 open findings')
    expect(link).toHaveTextContent('2 open tasks')
  })

  it('creates a project and shows a duplicate-name error', async () => {
    vi.mocked(listProjects).mockResolvedValue([])
    vi.mocked(createProject).mockRejectedValueOnce(new DataError('A project with this name already exists'))
    renderApp('/projects')

    await userEvent.click(await screen.findByRole('button', { name: '+ New project' }))
    await userEvent.type(screen.getByLabelText('Name'), 'Mobile App QA')
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }))

    expect(createProject).toHaveBeenCalledWith({ name: 'Mobile App QA', description: null })
    expect(await screen.findByRole('alert')).toHaveTextContent('A project with this name already exists')
  })
})
