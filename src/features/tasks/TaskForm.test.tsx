import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getMyProfile, listProfiles } from '../../data/profiles'
import { getProject, listProjects } from '../../data/projects'
import { createTask, listTasks } from '../../data/tasks'
import { listFindings } from '../../data/findings'
import { hedi, khaushik, lead, makeTask } from '../../test/factories'
import { auth } from '../../test/mockAuth'
import { renderApp } from '../../test/renderApp'

vi.mock('../../data/auth', () => import('../../test/mockAuth').then((m) => m.authModule))
vi.mock('../../data/profiles', () => import('../../test/mockData').then((m) => m.profilesModule))
vi.mock('../../data/projects', () => import('../../test/mockData').then((m) => m.projectsModule))
vi.mock('../../data/tasks', () => import('../../test/mockData').then((m) => m.tasksModule))
vi.mock('../../data/findings', () => import('../../test/mockData').then((m) => m.findingsModule))

const project = { id: 'p1', name: 'Mobile App QA', description: null, createdBy: lead.id, createdAt: '' }

describe('TaskForm', () => {
  beforeEach(() => {
    auth.signedInAs(lead.id)
    vi.mocked(getMyProfile).mockResolvedValue(lead)
    vi.mocked(listProfiles).mockResolvedValue([hedi, khaushik, lead])
    vi.mocked(listProjects).mockResolvedValue([{ ...project, openFindings: 0, openTasks: 0 }])
    vi.mocked(getProject).mockResolvedValue(project)
    vi.mocked(listTasks).mockResolvedValue([])
    vi.mocked(listFindings).mockResolvedValue([])
  })

  it('requires an assignee', async () => {
    renderApp('/tasks/new?projectId=p1')
    await userEvent.type(await screen.findByLabelText('Title'), 'Retest login')
    await userEvent.click(screen.getByRole('button', { name: 'Save task' }))
    expect(await screen.findByText('Assignee is required')).toBeInTheDocument()
    expect(createTask).not.toHaveBeenCalled()
  })

  it('creates a task with no deadline when the date is left empty, then returns to the project', async () => {
    vi.mocked(createTask).mockResolvedValue(makeTask({ projectId: 'p1' }))
    renderApp('/tasks/new?projectId=p1')
    await userEvent.type(await screen.findByLabelText('Title'), 'Retest login')
    await screen.findByRole('option', { name: 'Khaushik' })
    await userEvent.selectOptions(screen.getByLabelText('Assignee'), khaushik.id)
    await userEvent.type(screen.getByLabelText('Explanation'), 'On Android 13{enter}and 14')
    await userEvent.click(screen.getByRole('button', { name: 'Save task' }))

    expect(createTask).toHaveBeenCalledWith({
      projectId: 'p1',
      title: 'Retest login',
      assignedTo: khaushik.id,
      explanation: 'On Android 13\nand 14',
      deadline: null,
    })
    expect(await screen.findByRole('heading', { name: 'Mobile App QA' })).toBeInTheDocument()
  })
})
