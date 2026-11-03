import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listFindings } from '../../data/findings'
import { getFindingImagesFor } from '../../data/images'
import { getMyProfile, listProfiles } from '../../data/profiles'
import { deleteProject, getProject, getProjectDeleteCounts, listProjects } from '../../data/projects'
import { listUnseen } from '../../data/reads'
import { listTasks } from '../../data/tasks'
import type { Project } from '../../data/types'
import { FINDING_STATUS_LABEL, TASK_STATUS_LABEL } from '../../domain/actions'
import { hedi, khaushik, lead, makeFinding, makeTask } from '../../test/factories'
import { auth } from '../../test/mockAuth'
import { renderPage } from '../../test/renderPage'
import { ProjectPage } from './ProjectPage'

const renderApp = (path: string) =>
  renderPage(<ProjectPage />, { path, route: '/projects/:id', others: { '/projects': <h1>Projects</h1> } })

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
vi.mock('../../data/tasks', () => import('../../test/mockData').then((m) => m.tasksModule))
vi.mock('../../data/checklist', () => import('../../test/mockData').then((m) => m.checklistModule))
vi.mock('../../data/reads', () => import('../../test/mockData').then((m) => m.readsModule))
vi.mock('../../data/findings', () => ({ listFindings: vi.fn() }))
vi.mock('../../data/images', () => ({ getFindingImagesFor: vi.fn() }))

const project: Project = {
  id: 'p1',
  name: 'Mobile App QA',
  description: 'Android + iOS testing',
  createdBy: lead.id,
  createdAt: '2026-10-01T00:00:00Z',
  deletedAt: null,
  deletedBy: null,
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
      makeFinding({
        id: 'f-login',
        title: 'Login crash',
        explanation: 'Steps:\n1. Fresh install\n2. App closes',
        findingDate: '2026-10-29',
        status: 'open',
        authorId: hedi.id,
        imageCount: 2,
      }),
      makeFinding({
        id: 'f-push',
        title: 'Push delay',
        explanation: 'Median 31s',
        findingDate: '2026-10-29',
        status: 'verified',
        authorId: khaushik.id,
      }),
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

  it('filters findings to verified only', async () => {
    renderApp('/projects/p1')
    await screen.findByText('Login crash')
    await userEvent.selectOptions(screen.getByLabelText('Finding status'), 'verified')
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

  it('filter lists new statuses', async () => {
    renderApp('/projects/p1')
    await screen.findByText('Login crash')
    const labels = (name: string) =>
      within(screen.getByLabelText(name))
        .getAllByRole('option')
        .map((o) => o.textContent)
    expect(labels('Finding status')).toEqual(expect.arrayContaining(Object.values(FINDING_STATUS_LABEL)))
    expect(labels('Task status')).toEqual(expect.arrayContaining(Object.values(TASK_STATUS_LABEL)))
    expect(labels('Finding status').join()).not.toMatch(/waiting for lead/i)
    expect(labels('Task status').join()).not.toMatch(/waiting for lead/i)
  })

  it('filters tasks by a new status', async () => {
    vi.mocked(listTasks).mockResolvedValue([
      makeTask({ title: 'Retest login', projectId: 'p1' }),
      makeTask({ title: 'Stuck thing', projectId: 'p1', status: 'blocked', blockedReason: 'No device' }),
    ])
    renderApp('/projects/p1')
    await screen.findByText('Stuck thing')
    await userEvent.selectOptions(screen.getByLabelText('Task status'), 'blocked')
    expect(screen.getByText('Stuck thing')).toBeInTheDocument()
    expect(screen.queryByText('Retest login')).not.toBeInTheDocument()
  })

  it('shows the NEW dot on unseen tasks and findings only', async () => {
    vi.mocked(listTasks).mockResolvedValue([
      makeTask({ id: 't-new', title: 'Fresh task', projectId: 'p1' }),
      makeTask({ id: 't-old', title: 'Old task', projectId: 'p1' }),
    ])
    vi.mocked(listUnseen).mockResolvedValue([
      { type: 'task', id: 't-new' },
      { type: 'finding', id: 'f-push' },
    ])
    renderApp('/projects/p1')

    const taskRow = (await screen.findByText('Fresh task')).closest('li') as HTMLElement
    expect(await within(taskRow).findByLabelText('New')).toBeInTheDocument()
    expect(within((screen.getByText('Old task')).closest('li') as HTMLElement).queryByLabelText('New')).toBeNull()

    const pushRow = screen.getByText('Push delay').closest('li') as HTMLElement
    expect(within(pushRow).getByLabelText('New')).toBeInTheDocument()
    const loginRow = screen.getByText('Login crash').closest('li') as HTMLElement
    expect(within(loginRow).queryByLabelText('New')).toBeNull()
  })

  it('member can delete project', async () => {
    // Hedi did not create this project; everyone on the team may delete it.
    vi.mocked(getProjectDeleteCounts).mockResolvedValue({ findings: 3, tasks: 2, images: 5, attachments: 4 })
    vi.mocked(deleteProject).mockResolvedValue()
    renderApp('/projects/p1')

    await userEvent.click(await screen.findByRole('button', { name: 'Delete project' }))
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText('Moves the project and everything in it to Trash.')).toBeInTheDocument()
    expect(within(dialog).getByText(/3 findings.*2 tasks/)).toBeInTheDocument()
    expect(deleteProject).not.toHaveBeenCalled()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete project' }))
    expect(deleteProject).toHaveBeenCalledWith('p1')
    expect(await screen.findByRole('heading', { name: 'Projects' })).toBeInTheDocument()
  })

  describe('Show details', () => {
    const shots = {
      'f-login': [
        { id: 'i1', findingId: 'f-login', storagePath: 'findings/f-login/a.webp', position: 0, url: 'http://img/a', deletedAt: null, deletedBy: null },
        { id: 'i2', findingId: 'f-login', storagePath: 'findings/f-login/b.webp', position: 1, url: 'http://img/b', deletedAt: null, deletedBy: null },
      ],
    }

    it('starts collapsed and loads no screenshots', async () => {
      renderApp('/projects/p1')
      await screen.findByText('Login crash')
      expect(screen.getByRole('button', { name: 'Show details' })).toHaveAttribute('aria-pressed', 'false')
      expect(screen.queryByText(/Fresh install/)).not.toBeInTheDocument()
      expect(getFindingImagesFor).not.toHaveBeenCalled()
    })

    it('expands every finding with its explanation and screenshot thumbnails', async () => {
      vi.mocked(getFindingImagesFor).mockResolvedValue(shots)
      renderApp('/projects/p1')
      await userEvent.click(await screen.findByRole('button', { name: 'Show details' }))

      // Rendered as Markdown: "1. … 2. …" becomes a real numbered list.
      const login = await screen.findByText(/Fresh install/)
      expect(login.tagName).toBe('LI')
      expect(login.closest('ol')?.textContent).toMatch(/Fresh install\s*App closes/)
      expect(screen.getByText('Steps:')).toBeInTheDocument()
      expect(screen.getByText('Median 31s')).toBeInTheDocument()
      expect(screen.getByText(/Button misaligned/)).toBeInTheDocument()

      const thumbs = await screen.findAllByRole('img', { name: /Login crash — screenshot/ })
      expect(thumbs.map((img) => img.getAttribute('src'))).toEqual(['http://img/a', 'http://img/b'])
      expect(thumbs[0].closest('a')).toHaveAttribute('href', '/findings/f-login')
      // Only findings that have screenshots are looked up (Push delay has none).
      expect(getFindingImagesFor).toHaveBeenCalledWith(['f-login'])
      expect(screen.getByRole('button', { name: 'Hide details' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('remembers the choice next time a project is opened', async () => {
      vi.mocked(getFindingImagesFor).mockResolvedValue(shots)
      const first = renderApp('/projects/p1')
      await userEvent.click(await screen.findByRole('button', { name: 'Show details' }))
      first.unmount()

      renderApp('/projects/p1')
      expect(await screen.findByText(/Fresh install/)).toBeInTheDocument()
    })
  })
})
