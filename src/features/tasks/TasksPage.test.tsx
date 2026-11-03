import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getMyProfile, listProfiles } from '../../data/profiles'
import { listProjects } from '../../data/projects'
import { listTasks } from '../../data/tasks'
import { TASK_STATUS_LABEL } from '../../domain/actions'
import { hedi, khaushik, lead, makeTask } from '../../test/factories'
import { auth } from '../../test/mockAuth'
import { renderPage } from '../../test/renderPage'
import { TasksPage } from './TasksPage'

vi.mock('../../data/auth', () => import('../../test/mockAuth').then((m) => m.authModule))
vi.mock('../../data/profiles', () => import('../../test/mockData').then((m) => m.profilesModule))
vi.mock('../../data/projects', () => import('../../test/mockData').then((m) => m.projectsModule))
vi.mock('../../data/tasks', () => import('../../test/mockData').then((m) => m.tasksModule))
vi.mock('../../data/findings', () => import('../../test/mockData').then((m) => m.findingsModule))
vi.mock('../../data/reads', () => import('../../test/mockData').then((m) => m.readsModule))

const renderTasks = () => renderPage(<TasksPage />, { path: '/tasks', route: '/tasks' })

describe('TasksPage', () => {
  beforeEach(() => {
    auth.signedInAs(lead.id)
    vi.mocked(getMyProfile).mockResolvedValue(lead)
    vi.mocked(listProfiles).mockResolvedValue([hedi, khaushik, lead])
    vi.mocked(listProjects).mockResolvedValue([
      {
        id: 'project-1',
        name: 'Mobile App QA',
        description: null,
        createdBy: lead.id,
        createdAt: '',
        deletedAt: null,
        deletedBy: null,
        openFindings: 0,
        openTasks: 2,
      },
    ])
    vi.mocked(listTasks).mockResolvedValue([
      makeTask({ title: 'Hedi task', assignedTo: hedi.id }),
      makeTask({ title: 'Khaushik task', assignedTo: khaushik.id }),
      makeTask({ title: 'Finished task', assignedTo: hedi.id, status: 'done', doneAt: '2026-10-28T15:00:00Z' }),
    ])
  })

  it('shows open tasks by default with their project', async () => {
    renderTasks()
    await waitFor(() => expect(screen.getByLabelText('Assignee')).toHaveValue(lead.id))
    await userEvent.selectOptions(screen.getByLabelText('Assignee'), 'all')
    expect(await screen.findByText('Hedi task')).toBeInTheDocument()
    expect(screen.getByText('Khaushik task')).toBeInTheDocument()
    expect(screen.queryByText('Finished task')).not.toBeInTheDocument()
    expect(screen.getAllByText('Mobile App QA').length).toBeGreaterThan(0)
  })

  it('filters by assignee', async () => {
    renderTasks()
    await screen.findByText('Hedi task')
    await userEvent.selectOptions(screen.getByLabelText('Assignee'), hedi.id)
    expect(screen.getByText('Hedi task')).toBeInTheDocument()
    expect(screen.queryByText('Khaushik task')).not.toBeInTheDocument()
  })

  it('starts a member on their own tasks but lets them see everyone', async () => {
    auth.signedInAs(hedi.id)
    vi.mocked(getMyProfile).mockResolvedValue(hedi)
    renderTasks()
    // The list shows everyone until the profile arrives, then narrows to Hedi's own tasks.
    await waitFor(() => expect(screen.getByLabelText('Assignee')).toHaveValue(hedi.id))
    expect(screen.getByText('Hedi task')).toBeInTheDocument()
    expect(screen.queryByText('Khaushik task')).not.toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('Assignee'), 'all')
    expect(screen.getByText('Khaushik task')).toBeInTheDocument()
  })

  it('can show done tasks', async () => {
    renderTasks()
    await screen.findByText('Hedi task')
    await userEvent.selectOptions(screen.getByLabelText('Assignee'), 'all')
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'done')
    expect(screen.getByText('Finished task')).toBeInTheDocument()
    expect(screen.queryByText('Hedi task')).not.toBeInTheDocument()
  })

  it('filter lists new statuses', async () => {
    renderTasks()
    await screen.findByText('Hedi task')
    const options = within(screen.getByLabelText('Status'))
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(options).toEqual(expect.arrayContaining(Object.values(TASK_STATUS_LABEL)))
    expect(options.some((label) => /waiting for lead/i.test(label ?? ''))).toBe(false)
    expect(options).not.toContain('Submitted')
    expect(options).not.toContain('Approved')
  })

  it('shows a blocked task when filtering on Blocked', async () => {
    vi.mocked(listTasks).mockResolvedValue([makeTask({ title: 'Stuck task', status: 'blocked', blockedReason: 'No device' })])
    renderTasks()
    await screen.findByText('Stuck task')
    await userEvent.selectOptions(screen.getByLabelText('Assignee'), 'all')
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'blocked')
    expect(screen.getByText('Stuck task')).toBeInTheDocument()
  })
})
