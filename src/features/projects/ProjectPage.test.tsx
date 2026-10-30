import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listFindings } from '../../data/findings'
import { getMyProfile, listProfiles } from '../../data/profiles'
import { deleteProject, getProject, getProjectDeleteCounts, listProjects } from '../../data/projects'
import { listTasks } from '../../data/tasks'
import type { Project } from '../../data/types'
import { hedi, khaushik, lead, makeFinding, makeTask } from '../../test/factories'
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
vi.mock('../../data/tasks', () => ({ listTasks: vi.fn() }))
vi.mock('../../data/findings', () => ({ listFindings: vi.fn() }))

const project: Project = {
  id: 'p1',
  name: 'Mobile App QA',
  description: 'Android + iOS testing',
  createdBy: lead.id,
  createdAt: '2026-10-01T00:00:00Z',
}

function signInAs(profile: typeof hedi) {
  auth.signedInAs(profile.id)
  vi.mocked(getMyProfile).mockResolvedValue(profile)
}

describe('ProjectPage', () => {
  beforeEach(() => {
    signInAs(hedi)
    vi.mocked(listProfiles).mockResolvedValue([hedi, khaushik, lead])
    vi.mocked(getProject).mockResolvedValue(project)
    vi.mocked(listProjects).mockResolvedValue([])
    vi.mocked(listTasks).mockResolvedValue([makeTask({ title: 'Retest login', projectId: 'p1' })])
    vi.mocked(listFindings).mockResolvedValue([
      makeFinding({ title: 'Login crash', findingDate: '2026-10-29', status: 'open', authorId: hedi.id, imageCount: 2 }),
      makeFinding({ title: 'Push delay', findingDate: '2026-10-29', status: 'closed', authorId: khaushik.id }),
      makeFinding({ title: 'Button misaligned', findingDate: '2026-10-28', status: 'open', authorId: hedi.id }),
    ])
  })

  it('groups findings under day headings, newest first', async () => {
    renderApp('/projects/p1')
    const headings = await screen.findAllByRole('heading', { level: 3 })
    expect(headings.map((h) => h.textContent)).toEqual(['Thu, Oct 29', 'Wed, Oct 28'])
    expect(screen.getByRole('link', { name: /Login crash/ })).toHaveAttribute('href', expect.stringMatching(/^\/findings\//))
    expect(screen.getByRole('link', { name: /Login crash/ })).toHaveTextContent('📷 2')
  })

  it('filters findings to closed only', async () => {
    renderApp('/projects/p1')
    await screen.findByText('Login crash')
    await userEvent.selectOptions(screen.getByLabelText('Finding status'), 'closed')
    expect(screen.queryByText('Login crash')).not.toBeInTheDocument()
    expect(screen.getByText('Push delay')).toBeInTheDocument()
  })

  it('filters findings by person', async () => {
    renderApp('/projects/p1')
    await screen.findByText('Login crash')
    await userEvent.selectOptions(screen.getByLabelText('Person'), khaushik.id)
    expect(screen.queryByText('Login crash')).not.toBeInTheDocument()
    expect(screen.getByText('Push delay')).toBeInTheDocument()
  })

  it('shows the project\'s tasks with their assignee', async () => {
    renderApp('/projects/p1')
    const tasks = await screen.findByRole('region', { name: 'Tasks' })
    expect(await within(tasks).findByText('Retest login')).toBeInTheDocument()
    expect(within(tasks).getByText('Hedi')).toBeInTheDocument()
  })

  it('hides the delete button from members', async () => {
    renderApp('/projects/p1')
    await screen.findByRole('heading', { name: 'Mobile App QA' })
    expect(screen.queryByRole('button', { name: 'Delete project' })).not.toBeInTheDocument()
  })

  it('lets the lead delete after confirming the counts', async () => {
    signInAs(lead)
    vi.mocked(getProjectDeleteCounts).mockResolvedValue({ findings: 3, tasks: 2, images: 5 })
    vi.mocked(deleteProject).mockResolvedValue()
    renderApp('/projects/p1')

    await userEvent.click(await screen.findByRole('button', { name: 'Delete project' }))
    const dialog = await screen.findByRole('dialog')
    expect(
      await within(dialog).findByText('This deletes 3 findings, 2 tasks and 5 screenshots. This cannot be undone.'),
    ).toBeInTheDocument()
    expect(deleteProject).not.toHaveBeenCalled()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete project' }))
    expect(deleteProject).toHaveBeenCalledWith('p1')
    expect(await screen.findByRole('heading', { name: 'Projects' })).toBeInTheDocument()
  })
})
