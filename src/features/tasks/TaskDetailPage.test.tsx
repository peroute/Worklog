import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listComments } from '../../data/comments'
import { getMyProfile, listProfiles } from '../../data/profiles'
import { getProject } from '../../data/projects'
import { deleteTaskAttachment, listTaskAttachments, uploadTaskAttachments } from '../../data/taskAttachments'
import { getTask, requestChangesTask, setTaskStatus } from '../../data/tasks'
import type { Profile, TaskStatus } from '../../data/types'
import { hedi, khaushik, lead, makeAttachment, makeTask } from '../../test/factories'
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
    // clearAllMocks keeps return values between tests, so reset this one explicitly.
    vi.mocked(listTaskAttachments).mockResolvedValue([])
  })

  it('shows the task with its status, explanation and thread', async () => {
    vi.mocked(getTask).mockResolvedValue(task('submitted'))
    renderApp('/tasks/t1')
    expect(await screen.findByRole('heading', { level: 1, name: 'Retest login' })).toBeInTheDocument()
    expect(screen.getByText('Android 13').closest('.markdown')).not.toBeNull()
    expect(screen.getByText('Submitted')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Comments' })).toBeInTheDocument()
  })

  it('lets the lead approve finished work', async () => {
    signInAs(lead)
    vi.mocked(getTask).mockResolvedValue(task('submitted'))
    vi.mocked(setTaskStatus).mockResolvedValue(task('approved'))
    renderApp('/tasks/t1')
    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }))
    expect(setTaskStatus).toHaveBeenCalledWith('t1', 'approved')
  })

  it('lets the lead send it back with a comment', async () => {
    signInAs(lead)
    vi.mocked(getTask).mockResolvedValue(task('resubmitted'))
    vi.mocked(requestChangesTask).mockResolvedValue()
    renderApp('/tasks/t1')
    await userEvent.click(await screen.findByRole('button', { name: 'Request changes' }))
    const dialog = screen.getByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('What needs fixing?'), 'Also Android 14')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Request changes' }))
    expect(requestChangesTask).toHaveBeenCalledWith('t1', 'Also Android 14')
  })

  it('lets the assignee mark a sent-back task fixed, but not approve it', async () => {
    vi.mocked(getTask).mockResolvedValue(task('changes_requested'))
    vi.mocked(setTaskStatus).mockResolvedValue(task('resubmitted'))
    renderApp('/tasks/t1')
    await userEvent.click(await screen.findByRole('button', { name: 'Resubmit' }))
    expect(setTaskStatus).toHaveBeenCalledWith('t1', 'resubmitted')
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
  })

  // In these tests the lead created the task and Hedi (signed in by default) is the assignee.
  const brief = makeAttachment({
    id: 'a1', taskId: 't1', fileName: 'test-plan.pdf', sizeBytes: 1_258_291, position: 0,
    uploadedBy: lead.id, url: 'https://signed/b?download=test-plan.pdf',
  })
  const proof = makeAttachment({
    id: 'a2', taskId: 't1', fileName: 'done.webp', mimeType: 'image/webp', position: 1,
    uploadedBy: hedi.id, url: 'https://signed/a',
  })

  it('shows images as thumbnails, documents as downloads, and who added each', async () => {
    vi.mocked(getTask).mockResolvedValue(task('todo'))
    vi.mocked(listTaskAttachments).mockResolvedValue([brief, proof])
    renderApp('/tasks/t1')

    const section = await screen.findByRole('region', { name: 'Attachments (2)' })
    expect(within(section).getByRole('img', { name: 'done.webp' })).toHaveAttribute('src', 'https://signed/a')
    expect(within(section).getByRole('link', { name: 'Download test-plan.pdf' })).toHaveAttribute(
      'href',
      'https://signed/b?download=test-plan.pdf',
    )
    expect(within(section).getByText('1.2 MB · Added by Lead')).toBeInTheDocument()
    expect(within(section).getByText('Added by you')).toBeInTheDocument()
  })

  it('lets the assignee remove their own proof, but not the brief', async () => {
    vi.mocked(getTask).mockResolvedValue(task('todo'))
    vi.mocked(listTaskAttachments).mockResolvedValue([brief, proof])
    vi.mocked(deleteTaskAttachment).mockResolvedValue()
    renderApp('/tasks/t1')

    await screen.findByRole('region', { name: 'Attachments (2)' })
    expect(screen.queryByRole('button', { name: 'Remove test-plan.pdf' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Remove done.webp' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }))
    expect(deleteTaskAttachment).toHaveBeenCalledWith(proof)
  })

  it('lets the assignee add proof of work from the task page', async () => {
    vi.mocked(getTask).mockResolvedValue(task('submitted'))
    vi.mocked(listTaskAttachments).mockResolvedValue([brief])
    renderApp('/tasks/t1')

    await userEvent.click(await screen.findByRole('button', { name: 'Add proof of work' }))
    await userEvent.upload(
      screen.getByLabelText('Add files'),
      new File(['%PDF'], 'results.pdf', { type: 'application/pdf' }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Upload 1' }))

    // goes after the brief (position 0), so the order stays stable
    expect(uploadTaskAttachments).toHaveBeenCalledWith(
      't1',
      [{ blob: expect.any(File), fileName: 'results.pdf', mimeType: 'application/pdf' }],
      1,
    )
  })

  it('invites the assignee to add proof even when there are no attachments yet', async () => {
    vi.mocked(getTask).mockResolvedValue(task('todo'))
    renderApp('/tasks/t1')
    const section = await screen.findByRole('region', { name: 'Attachments (0)' })
    expect(within(section).getByText(/Optional: attach screenshots or files/)).toBeInTheDocument()
  })

  it('after approval, still allows adding files but not removing them', async () => {
    vi.mocked(getTask).mockResolvedValue(task('approved'))
    vi.mocked(listTaskAttachments).mockResolvedValue([brief, proof])
    renderApp('/tasks/t1')
    await screen.findByRole('region', { name: 'Attachments (2)' })
    expect(screen.getByRole('button', { name: 'Add proof of work' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Remove / })).not.toBeInTheDocument()
  })

  it('shows nothing to someone not on the task when there are no attachments', async () => {
    signInAs(khaushik)
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
