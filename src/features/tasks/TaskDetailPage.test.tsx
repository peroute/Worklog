import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listComments } from '../../data/comments'
import { getMyProfile, listProfiles } from '../../data/profiles'
import { getProject } from '../../data/projects'
import { listTaskAttachments } from '../../data/taskAttachments'
import { getTask, sendBackTask, setTaskStatus } from '../../data/tasks'
import type { Profile, TaskStatus } from '../../data/types'
import { hedi, khaushik, lead, makeTask } from '../../test/factories'
import { auth } from '../../test/mockAuth'
import { renderApp } from '../../test/renderApp'

vi.mock('../../data/auth', () => import('../../test/mockAuth').then((m) => m.authModule))
vi.mock('../../data/profiles', () => import('../../test/mockData').then((m) => m.profilesModule))
vi.mock('../../data/projects', () => import('../../test/mockData').then((m) => m.projectsModule))
vi.mock('../../data/tasks', () => import('../../test/mockData').then((m) => m.tasksModule))
vi.mock('../../data/comments', () => import('../../test/mockData').then((m) => m.commentsModule))
vi.mock('../../data/findings', () => import('../../test/mockData').then((m) => m.findingsModule))
vi.mock('../../data/taskAttachments', () => import('../../test/mockData').then((m) => m.taskAttachmentsModule))

const task = (status: TaskStatus) =>
  makeTask({
    id: 't1',
    title: 'Retest login',
    projectId: 'p1',
    assignedTo: hedi.id,
    createdBy: lead.id,
    status,
    explanation: 'Android 13',
  })

function signInAs(profile: Profile) {
  auth.signedInAs(profile.id)
  vi.mocked(getMyProfile).mockResolvedValue(profile)
}

describe('TaskDetailPage', () => {
  beforeEach(() => {
    signInAs(hedi)
    vi.mocked(listProfiles).mockResolvedValue([hedi, khaushik, lead])
    vi.mocked(getProject).mockResolvedValue({
      id: 'p1',
      name: 'Mobile App QA',
      description: null,
      createdBy: lead.id,
      createdAt: '',
    })
    vi.mocked(listComments).mockResolvedValue([])
  })

  it('shows the task with its status, explanation and thread', async () => {
    vi.mocked(getTask).mockResolvedValue(task('done'))
    renderApp('/tasks/t1')
    expect(await screen.findByRole('heading', { level: 1, name: 'Retest login' })).toBeInTheDocument()
    expect(screen.getByText('Android 13')).toHaveClass('whitespace-pre-wrap')
    expect(screen.getByText('Done')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Comments' })).toBeInTheDocument()
  })

  it('lets the lead approve finished work', async () => {
    signInAs(lead)
    vi.mocked(getTask).mockResolvedValue(task('done'))
    vi.mocked(setTaskStatus).mockResolvedValue(task('approved'))
    renderApp('/tasks/t1')
    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }))
    expect(setTaskStatus).toHaveBeenCalledWith('t1', 'approved')
  })

  it('lets the lead send it back with a comment', async () => {
    signInAs(lead)
    vi.mocked(getTask).mockResolvedValue(task('fixed'))
    vi.mocked(sendBackTask).mockResolvedValue()
    renderApp('/tasks/t1')
    await userEvent.click(await screen.findByRole('button', { name: 'Send back for review' }))
    const dialog = screen.getByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('What needs fixing?'), 'Also Android 14')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send back' }))
    expect(sendBackTask).toHaveBeenCalledWith('t1', 'Also Android 14')
  })

  it('lets the assignee mark a sent-back task fixed, but not approve it', async () => {
    vi.mocked(getTask).mockResolvedValue(task('needs_review'))
    vi.mocked(setTaskStatus).mockResolvedValue(task('fixed'))
    renderApp('/tasks/t1')
    await userEvent.click(await screen.findByRole('button', { name: 'Mark fixed' }))
    expect(setTaskStatus).toHaveBeenCalledWith('t1', 'fixed')
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
  })

  it('shows image attachments as thumbnails and documents as downloads', async () => {
    vi.mocked(getTask).mockResolvedValue(task('todo'))
    vi.mocked(listTaskAttachments).mockResolvedValue([
      { id: 'a1', taskId: 't1', storagePath: 'tasks/t1/a.webp', fileName: 'crash.webp', mimeType: 'image/webp', sizeBytes: 50_000, position: 0, url: 'https://signed/a' },
      { id: 'a2', taskId: 't1', storagePath: 'tasks/t1/b.pdf', fileName: 'test-plan.pdf', mimeType: 'application/pdf', sizeBytes: 1_258_291, position: 1, url: 'https://signed/b?download=test-plan.pdf' },
    ])
    renderApp('/tasks/t1')

    const section = await screen.findByRole('region', { name: 'Attachments (2)' })
    expect(within(section).getByRole('img', { name: 'crash.webp' })).toHaveAttribute('src', 'https://signed/a')
    expect(within(section).getByText('1.2 MB')).toBeInTheDocument()
    expect(within(section).getByRole('link', { name: 'Download test-plan.pdf' })).toHaveAttribute(
      'href',
      'https://signed/b?download=test-plan.pdf',
    )
  })

  it('shows no attachments section when there are none', async () => {
    vi.mocked(getTask).mockResolvedValue(task('todo'))
    renderApp('/tasks/t1')
    await screen.findByRole('heading', { level: 1, name: 'Retest login' })
    expect(listTaskAttachments).toHaveBeenCalledWith('t1')
    expect(screen.queryByRole('region', { name: /Attachments/ })).not.toBeInTheDocument()
  })

  it('reports a missing task', async () => {
    vi.mocked(getTask).mockRejectedValue(new Error('Task not found'))
    renderApp('/tasks/missing')
    expect(await screen.findByRole('alert')).toHaveTextContent('Task not found')
  })
})
