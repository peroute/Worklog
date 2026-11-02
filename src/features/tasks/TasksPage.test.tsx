import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getMyProfile, listProfiles } from '../../data/profiles'
import { listProjects } from '../../data/projects'
import { listTasks } from '../../data/tasks'
import { hedi, khaushik, lead, makeTask } from '../../test/factories'
import { auth } from '../../test/mockAuth'
import { renderApp } from '../../test/renderApp'

vi.mock('../../data/auth', () => import('../../test/mockAuth').then((m) => m.authModule))
vi.mock('../../data/profiles', () => import('../../test/mockData').then((m) => m.profilesModule))
vi.mock('../../data/projects', () => import('../../test/mockData').then((m) => m.projectsModule))
vi.mock('../../data/tasks', () => import('../../test/mockData').then((m) => m.tasksModule))
vi.mock('../../data/findings', () => import('../../test/mockData').then((m) => m.findingsModule))

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
        openFindings: 0,
        openTasks: 2,
      },
    ])
    vi.mocked(listTasks).mockResolvedValue([
      makeTask({ title: 'Hedi task', assignedTo: hedi.id }),
      makeTask({ title: 'Khaushik task', assignedTo: khaushik.id }),
      makeTask({ title: 'Finished task', assignedTo: hedi.id, status: 'submitted', doneAt: '2026-10-28T15:00:00Z' }),
    ])
  })

  it('shows open tasks by default with their project', async () => {
    renderApp('/tasks')
    expect(await screen.findByText('Hedi task')).toBeInTheDocument()
    expect(screen.getByText('Khaushik task')).toBeInTheDocument()
    expect(screen.queryByText('Finished task')).not.toBeInTheDocument()
    expect(screen.getAllByText('Mobile App QA').length).toBeGreaterThan(0)
  })

  it('filters by assignee', async () => {
    renderApp('/tasks')
    await screen.findByText('Hedi task')
    await userEvent.selectOptions(screen.getByLabelText('Assignee'), hedi.id)
    expect(screen.getByText('Hedi task')).toBeInTheDocument()
    expect(screen.queryByText('Khaushik task')).not.toBeInTheDocument()
  })

  it('can show done tasks', async () => {
    renderApp('/tasks')
    await screen.findByText('Hedi task')
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'submitted')
    expect(screen.getByText('Finished task')).toBeInTheDocument()
    expect(screen.queryByText('Hedi task')).not.toBeInTheDocument()
  })
})
