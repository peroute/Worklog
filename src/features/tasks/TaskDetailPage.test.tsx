import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listComments } from '../../data/comments'
import { getMyProfile, listProfiles } from '../../data/profiles'
import { getProject } from '../../data/projects'
import { deleteTaskAttachment, listTaskAttachments, uploadTaskAttachments } from '../../data/taskAttachments'
import { getTask, requestChangesTask, setTaskStatus, submitTask } from '../../data/tasks'
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

/** The header card that holds the title, details and brief. */
const headerCard = () => screen.getByRole('heading', { level: 1 }).closest('header') as HTMLElement

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
    // clearAllMocks keeps return values between tests, so reset these explicitly.
    vi.mocked(listTaskAttachments).mockResolvedValue([])
    vi.mocked(uploadTaskAttachments).mockResolvedValue({ uploaded: 0, failed: 0 })
  })

  it('shows the task with its details under the title, its status and thread', async () => {
    vi.mocked(getTask).mockResolvedValue(task('submitted'))
    renderApp('/tasks/t1')
    expect(await screen.findByRole('heading', { level: 1, name: 'Retest login' })).toBeInTheDocument()
    // The details sit in the header card right under the title, not floating below the buttons.
    expect(within(headerCard()).getByRole('heading', { name: 'Details' })).toBeInTheDocument()
    // Rendered through the Markdown component (paragraph inside the .markdown wrapper).
    expect(within(headerCard()).getByText('Android 13').closest('.markdown')).not.toBeNull()
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

  // In these tests the lead created the task and Hedi (signed in by default) is the assignee.
  const brief = makeAttachment({
    id: 'a1', taskId: 't1', fileName: 'test-plan.pdf', sizeBytes: 1_258_291, position: 0,
    uploadedBy: lead.id, kind: 'brief', url: 'https://signed/b?download=test-plan.pdf',
  })
  const proof = makeAttachment({
    id: 'a2', taskId: 't1', fileName: 'done.webp', mimeType: 'image/webp', position: 1,
    uploadedBy: hedi.id, kind: 'proof', url: 'https://signed/a',
  })

  it('lets the assignee hand in an explanation plus proof in one go', async () => {
    vi.mocked(getTask).mockResolvedValue(task('todo'))
    vi.mocked(listTaskAttachments).mockResolvedValue([brief])
    vi.mocked(uploadTaskAttachments).mockResolvedValue({ uploaded: 1, failed: 0 })
    vi.mocked(submitTask).mockResolvedValue(task('submitted'))
    renderApp('/tasks/t1')

    await userEvent.click(await screen.findByRole('button', { name: 'Submit work' }))
    const form = screen.getByRole('region', { name: 'Submit your work' })
    await userEvent.type(within(form).getByLabelText('What did you do?'), 'Passes on Android 13')
    await userEvent.upload(
      within(form).getByLabelText('Add files'),
      new File(['%PDF'], 'results.pdf', { type: 'application/pdf' }),
    )
    await userEvent.click(within(form).getByRole('button', { name: 'Submit for review' }))

    // Proof goes after the brief (position 0) and is tagged as proof.
    expect(uploadTaskAttachments).toHaveBeenCalledWith(
      't1',
      [{ blob: expect.any(File), fileName: 'results.pdf', mimeType: 'application/pdf' }],
      1,
      'proof',
    )
    expect(submitTask).toHaveBeenCalledWith('t1', { note: 'Passes on Android 13', status: 'submitted' })
    expect(setTaskStatus).not.toHaveBeenCalled()
  })

  it('does not submit when a proof file fails to upload', async () => {
    vi.mocked(getTask).mockResolvedValue(task('todo'))
    vi.mocked(uploadTaskAttachments).mockResolvedValue({ uploaded: 0, failed: 1 })
    renderApp('/tasks/t1')

    await userEvent.click(await screen.findByRole('button', { name: 'Submit work' }))
    await userEvent.upload(screen.getByLabelText('Add files'), new File(['x'], 'log.txt', { type: 'text/plain' }))
    await userEvent.click(screen.getByRole('button', { name: 'Submit for review' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('nothing was submitted')
    expect(submitTask).not.toHaveBeenCalled()
  })

  it('reopens the form with the previous note when resubmitting, and cannot approve', async () => {
    vi.mocked(getTask).mockResolvedValue({ ...task('changes_requested'), submissionNote: 'First try' })
    vi.mocked(submitTask).mockResolvedValue(task('resubmitted'))
    renderApp('/tasks/t1')

    await userEvent.click(await screen.findByRole('button', { name: 'Resubmit' }))
    const note = screen.getByLabelText('What did you do?')
    expect(note).toHaveValue('First try')
    await userEvent.type(note, ', fixed Android 14')
    await userEvent.click(screen.getByRole('button', { name: 'Resubmit for review' }))

    expect(submitTask).toHaveBeenCalledWith('t1', { note: 'First try, fixed Android 14', status: 'resubmitted' })
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
  })

  it('shows the lead the submission (who, explanation, proof) apart from the brief', async () => {
    signInAs(lead)
    vi.mocked(getTask).mockResolvedValue({
      ...task('submitted'),
      submissionNote: 'Tested on two devices',
      doneAt: '2026-11-02T15:00:00Z',
    })
    vi.mocked(listTaskAttachments).mockResolvedValue([brief, proof])
    renderApp('/tasks/t1')

    const submission = await screen.findByRole('region', { name: 'Submission' })
    expect(within(submission).getByText('Hedi')).toBeInTheDocument()
    expect(within(submission).getByText('Tested on two devices')).toBeInTheDocument()
    expect(within(submission).getByRole('img', { name: 'done.webp' })).toHaveAttribute('src', 'https://signed/a')
    expect(within(submission).queryByText('test-plan.pdf')).not.toBeInTheDocument()

    // The brief stays with the task's details, as a download.
    expect(within(headerCard()).getByRole('link', { name: 'Download test-plan.pdf' })).toHaveAttribute(
      'href',
      'https://signed/b?download=test-plan.pdf',
    )
    expect(within(headerCard()).getByText('1.2 MB')).toBeInTheDocument()
  })

  it('lets the assignee remove their own proof, but not the brief', async () => {
    vi.mocked(getTask).mockResolvedValue(task('submitted'))
    vi.mocked(listTaskAttachments).mockResolvedValue([brief, proof])
    vi.mocked(deleteTaskAttachment).mockResolvedValue()
    renderApp('/tasks/t1')

    await screen.findByRole('region', { name: 'Submission' })
    expect(screen.queryByRole('button', { name: 'Remove test-plan.pdf' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Remove done.webp' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }))
    expect(deleteTaskAttachment).toHaveBeenCalledWith(proof)
  })

  it('lets the assignee edit a submission while it waits for review, without changing the status', async () => {
    vi.mocked(getTask).mockResolvedValue({ ...task('submitted'), submissionNote: 'Done' })
    vi.mocked(submitTask).mockResolvedValue(task('submitted'))
    renderApp('/tasks/t1')

    await userEvent.click(await screen.findByRole('button', { name: 'Edit submission' }))
    await userEvent.type(screen.getByLabelText('What did you do?'), ' on Android 13')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(submitTask).toHaveBeenCalledWith('t1', { note: 'Done on Android 13', status: null })
  })

  it('after approval, the assignee can add proof but not rewrite the note or remove files', async () => {
    vi.mocked(getTask).mockResolvedValue({ ...task('approved'), submissionNote: 'Done' })
    vi.mocked(listTaskAttachments).mockResolvedValue([brief, proof])
    renderApp('/tasks/t1')

    await userEvent.click(await screen.findByRole('button', { name: 'Add proof' }))
    expect(screen.queryByLabelText('What did you do?')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Add files')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Remove / })).not.toBeInTheDocument()
  })

  it('shows no submission until the work is handed in', async () => {
    signInAs(khaushik)
    vi.mocked(getTask).mockResolvedValue(task('todo'))
    renderApp('/tasks/t1')
    await screen.findByRole('heading', { level: 1, name: 'Retest login' })
    expect(listTaskAttachments).toHaveBeenCalledWith('t1')
    expect(screen.queryByRole('region', { name: 'Submission' })).not.toBeInTheDocument()
  })

  it('reports a missing task', async () => {
    vi.mocked(getTask).mockRejectedValue(new Error('Task not found'))
    renderApp('/tasks/missing')
    expect(await screen.findByRole('alert')).toHaveTextContent('Task not found')
  })
})
