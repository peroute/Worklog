import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listActivity } from '../../data/activity'
import { listComments } from '../../data/comments'
import { listFindings } from '../../data/findings'
import { getMyProfile, listProfiles } from '../../data/profiles'
import { getProject } from '../../data/projects'
import { listTaskAttachments, uploadTaskAttachments } from '../../data/taskAttachments'
import { deleteTask, getTask, setTaskStatus, updateTask } from '../../data/tasks'
import type { Profile, TaskAttachment, TaskStatus } from '../../data/types'
import { hedi, khaushik, lead, makeAttachment, makeFinding, makeTask } from '../../test/factories'
import { auth } from '../../test/mockAuth'
import { renderPage } from '../../test/renderPage'
import { TaskDetailPage } from './TaskDetailPage'

vi.mock('../../data/auth', () => import('../../test/mockAuth').then((m) => m.authModule))
vi.mock('../../data/profiles', () => import('../../test/mockData').then((m) => m.profilesModule))
vi.mock('../../data/projects', () => import('../../test/mockData').then((m) => m.projectsModule))
vi.mock('../../data/tasks', () => import('../../test/mockData').then((m) => m.tasksModule))
vi.mock('../../data/comments', () => import('../../test/mockData').then((m) => m.commentsModule))
vi.mock('../../data/findings', () => import('../../test/mockData').then((m) => m.findingsModule))
vi.mock('../../data/taskAttachments', () => import('../../test/mockData').then((m) => m.taskAttachmentsModule))
vi.mock('../../data/checklist', () => import('../../test/mockData').then((m) => m.checklistModule))
vi.mock('../../data/activity', () => import('../../test/mockData').then((m) => m.activityModule))
vi.mock('../../data/reads', () => import('../../test/mockData').then((m) => m.readsModule))
// Owned by another task (still importing the deleted permissions module); stubbed so this page is tested alone.
vi.mock('./AttachmentList', () => ({
  AttachmentList: ({ attachments }: { attachments: TaskAttachment[] }) => (
    <ul>
      {attachments.map((a) => (
        <li key={a.id}>{a.fileName}</li>
      ))}
    </ul>
  ),
}))
vi.mock('./ChecklistSection', () => ({ ChecklistSection: () => <div>checklist</div> }))

const task = (status: TaskStatus, overrides: Parameters<typeof makeTask>[0] = {}) =>
  makeTask({
    id: 't1',
    title: 'Retest login',
    projectId: 'p1',
    assignedTo: hedi.id,
    createdBy: lead.id,
    status,
    explanation: 'Android 13',
    ...overrides,
  })

function signInAs(profile: Profile) {
  auth.signedInAs(profile.id)
  vi.mocked(getMyProfile).mockResolvedValue(profile)
}

function mount() {
  return renderPage(<TaskDetailPage />, {
    path: '/tasks/t1',
    route: '/tasks/:id',
    others: { '/projects/:id': <h1>Project page</h1>, '/findings/:id': <h1>Finding page</h1> },
  })
}

/** The header card that holds the title, details and brief. */
const headerCard = () => screen.getByRole('heading', { level: 1 }).closest('header') as HTMLElement

const brief = makeAttachment({ id: 'a1', taskId: 't1', fileName: 'test-plan.pdf', uploadedBy: lead.id, kind: 'brief' })
const proof = makeAttachment({ id: 'a2', taskId: 't1', fileName: 'done.webp', position: 1, uploadedBy: hedi.id, kind: 'proof' })

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
      deletedAt: null,
      deletedBy: null,
    })
    vi.mocked(listComments).mockResolvedValue([])
    vi.mocked(listActivity).mockResolvedValue([])
    vi.mocked(listFindings).mockResolvedValue([])
    vi.mocked(listTaskAttachments).mockReset()
    vi.mocked(listTaskAttachments).mockResolvedValue([])
    vi.mocked(uploadTaskAttachments).mockReset()
    vi.mocked(uploadTaskAttachments).mockResolvedValue({ uploaded: 0, failed: 0 })
    vi.mocked(setTaskStatus).mockReset()
    vi.mocked(setTaskStatus).mockResolvedValue()
    vi.mocked(updateTask).mockReset()
    vi.mocked(getTask).mockReset()
  })

  it('shows the task with its details under the title, its status and timeline', async () => {
    vi.mocked(getTask).mockResolvedValue(task('waiting_for_review'))
    mount()
    expect(await screen.findByRole('heading', { level: 1, name: 'Retest login' })).toBeInTheDocument()
    expect(within(headerCard()).getByRole('heading', { name: 'Details' })).toBeInTheDocument()
    expect(within(headerCard()).getByText('Android 13').closest('.markdown')).not.toBeNull()
    expect(screen.getByText('Waiting for review')).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'Timeline' })).toBeInTheDocument()
  })

  it('lists linked findings', async () => {
    vi.mocked(getTask).mockResolvedValue(task('in_progress'))
    vi.mocked(listFindings).mockResolvedValue([
      makeFinding({ id: 'f1', title: 'Crash on login', status: 'fixed', taskId: 't1' }),
      makeFinding({ id: 'f2', title: 'Typo on welcome', status: 'open', taskId: 't1' }),
    ])
    mount()
    const section = await screen.findByRole('region', { name: 'Findings from this task' })
    expect(listFindings).toHaveBeenCalledWith({ taskId: 't1' })
    expect(await within(section).findByRole('link', { name: /Crash on login/ })).toHaveAttribute('href', '/findings/f1')
    expect(within(section).getByText('Fixed, please re-check')).toBeInTheDocument()
    expect(within(section).getByRole('link', { name: /Typo on welcome/ })).toBeInTheDocument()
    expect(within(section).getByText('Open')).toBeInTheDocument()
  })

  it('hides the findings list when there are none', async () => {
    vi.mocked(getTask).mockResolvedValue(task('in_progress'))
    mount()
    await screen.findByRole('heading', { level: 1, name: 'Retest login' })
    await vi.waitFor(() => expect(listFindings).toHaveBeenCalled())
    expect(screen.queryByRole('region', { name: 'Findings from this task' })).not.toBeInTheDocument()
  })

  it('shows blocked reason', async () => {
    vi.mocked(getTask).mockResolvedValue(task('blocked', { blockedReason: 'Waiting for IT' }))
    mount()
    expect(await screen.findByText('Blocked')).toBeInTheDocument()
    expect(screen.getByText(/Waiting for IT/)).toBeInTheDocument()
  })

  it('submitter sees Withdraw', async () => {
    vi.mocked(getTask).mockResolvedValue(task('waiting_for_review', { submittedBy: hedi.id }))
    mount()
    await screen.findByRole('heading', { level: 1, name: 'Retest login' })
    // The creator (lead) has to approve, so for the submitter the action sits under More.
    await userEvent.click(await screen.findByRole('button', { name: 'More' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Withdraw' }))
    expect(setTaskStatus).toHaveBeenCalledWith('t1', 'in_progress', {})
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
  })

  it('lets the creator approve finished work', async () => {
    signInAs(lead)
    vi.mocked(getTask).mockResolvedValue(task('waiting_for_review', { submittedBy: hedi.id }))
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }))
    expect(setTaskStatus).toHaveBeenCalledWith('t1', 'done', {})
  })

  it('makes the reviewer write a comment to request changes', async () => {
    signInAs(lead)
    vi.mocked(getTask).mockResolvedValue(task('waiting_for_review', { submittedBy: hedi.id }))
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Request changes' }))
    const dialog = screen.getByRole('dialog')
    const send = within(dialog).getByRole('button', { name: 'Request changes' })
    expect(send).toBeDisabled()
    await userEvent.type(within(dialog).getByLabelText('Comment'), 'Also Android 14')
    await userEvent.click(send)
    expect(setTaskStatus).toHaveBeenCalledWith('t1', 'in_progress', { comment: 'Also Android 14' })
  })

  it('asks for a reason when blocking', async () => {
    vi.mocked(getTask).mockResolvedValue(task('in_progress'))
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Blocked…' }))
    await userEvent.type(screen.getByLabelText("What's blocking it?"), 'Waiting for IT')
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Blocked…' }))
    expect(setTaskStatus).toHaveBeenCalledWith('t1', 'blocked', { reason: 'Waiting for IT' })
  })

  it('shows the error and refetches when the change is refused', async () => {
    vi.mocked(getTask).mockResolvedValue(task('todo'))
    vi.mocked(setTaskStatus).mockRejectedValue(new Error('Task changed meanwhile'))
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Start' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Task changed meanwhile')
    await vi.waitFor(() => expect(getTask).toHaveBeenCalledTimes(2))
  })

  it('moves a task that needs review to review with the note from the submission form', async () => {
    vi.mocked(getTask).mockResolvedValue(task('in_progress', { needsReview: true }))
    vi.mocked(listTaskAttachments).mockResolvedValue([brief])
    vi.mocked(uploadTaskAttachments).mockResolvedValue({ uploaded: 1, failed: 0 })
    mount()

    await userEvent.click(await screen.findByRole('button', { name: 'Mark done' }))
    expect(setTaskStatus).not.toHaveBeenCalled()
    const form = screen.getByRole('region', { name: 'Submit your work' })
    await userEvent.type(within(form).getByLabelText('What did you do?'), 'Passes on Android 13')
    await userEvent.upload(
      within(form).getByLabelText('Add files'),
      new File(['%PDF'], 'results.pdf', { type: 'application/pdf' }),
    )
    await userEvent.click(within(form).getByRole('button', { name: 'Submit for review' }))

    // Proof goes after the brief (position 0) and is tagged as proof.
    await vi.waitFor(() =>
      expect(uploadTaskAttachments).toHaveBeenCalledWith(
        't1',
        [{ blob: expect.any(File), fileName: 'results.pdf', mimeType: 'application/pdf' }],
        1,
        'proof',
      ),
    )
    await vi.waitFor(() =>
      expect(setTaskStatus).toHaveBeenCalledWith('t1', 'waiting_for_review', { note: 'Passes on Android 13' }),
    )
  })

  it('marks a task that needs no review done straight from the form', async () => {
    vi.mocked(getTask).mockResolvedValue(task('in_progress', { needsReview: false }))
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Mark done' }))
    const form = screen.getByRole('region', { name: 'Mark done' })
    await userEvent.click(within(form).getByRole('button', { name: 'Mark done' }))
    await vi.waitFor(() => expect(setTaskStatus).toHaveBeenCalledWith('t1', 'done', {}))
  })

  it('does not change the status when a proof file fails to upload', async () => {
    vi.mocked(getTask).mockResolvedValue(task('in_progress', { needsReview: true }))
    vi.mocked(uploadTaskAttachments).mockResolvedValue({ uploaded: 0, failed: 1 })
    mount()

    await userEvent.click(await screen.findByRole('button', { name: 'Mark done' }))
    await userEvent.upload(screen.getByLabelText('Add files'), new File(['x'], 'log.txt', { type: 'text/plain' }))
    await userEvent.click(screen.getByRole('button', { name: 'Submit for review' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('nothing was submitted')
    expect(setTaskStatus).not.toHaveBeenCalled()
  })

  it('pre-fills the previous note when finishing again after changes were requested', async () => {
    vi.mocked(getTask).mockResolvedValue(task('in_progress', { needsReview: true, submissionNote: 'First try' }))
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Mark done' }))
    expect(screen.getByLabelText('What did you do?')).toHaveValue('First try')
  })

  it('shows the submission (who, explanation, proof) apart from the brief', async () => {
    signInAs(lead)
    vi.mocked(getTask).mockResolvedValue(
      task('waiting_for_review', { submissionNote: 'Tested on two devices', doneAt: '2026-11-02T15:00:00Z' }),
    )
    vi.mocked(listTaskAttachments).mockResolvedValue([brief, proof])
    mount()

    const submission = await screen.findByRole('region', { name: 'Submission' })
    expect(within(submission).getByText('Hedi')).toBeInTheDocument()
    expect(within(submission).getByText('Tested on two devices')).toBeInTheDocument()
    expect(within(submission).getByText('done.webp')).toBeInTheDocument()
    expect(within(submission).queryByText('test-plan.pdf')).not.toBeInTheDocument()
    expect(within(headerCard()).getByText('test-plan.pdf')).toBeInTheDocument()
  })

  it('lets anyone edit the submission note without changing the status', async () => {
    signInAs(khaushik)
    vi.mocked(getTask).mockResolvedValue(task('waiting_for_review', { submissionNote: 'Done' }))
    vi.mocked(updateTask).mockResolvedValue(task('waiting_for_review'))
    mount()

    await userEvent.click(await screen.findByRole('button', { name: 'Edit submission' }))
    await userEvent.type(screen.getByLabelText('What did you do?'), ' on Android 13')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(updateTask).toHaveBeenCalledWith('t1', { submissionNote: 'Done on Android 13' }))
    expect(setTaskStatus).not.toHaveBeenCalled()
  })

  it('shows no submission until the work is handed in', async () => {
    signInAs(khaushik)
    vi.mocked(getTask).mockResolvedValue(task('todo'))
    mount()
    await screen.findByRole('heading', { level: 1, name: 'Retest login' })
    await vi.waitFor(() => expect(listTaskAttachments).toHaveBeenCalledWith('t1'))
    expect(screen.queryByRole('region', { name: 'Submission' })).not.toBeInTheDocument()
  })

  it('shows Edit and Delete to everyone, and Delete moves to Trash after confirming', async () => {
    signInAs(khaushik)
    vi.mocked(getTask).mockResolvedValue(task('todo'))
    vi.mocked(deleteTask).mockResolvedValue()
    mount()
    expect(await screen.findByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/tasks/t1/edit')
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(deleteTask).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog', { name: 'Move to Trash?' })
    expect(dialog).toHaveTextContent('restore it from Trash')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Move to Trash' }))
    expect(deleteTask).toHaveBeenCalledWith('t1')
    expect(await screen.findByRole('heading', { name: 'Project page' })).toBeInTheDocument()
  })

  it('reports a missing task', async () => {
    vi.mocked(getTask).mockRejectedValue(new Error('Task not found'))
    mount()
    expect(await screen.findByRole('alert')).toHaveTextContent('Task not found')
  })

  it('shows who created it and when it starts, but never when it was created', async () => {
    vi.mocked(getTask).mockResolvedValue(task('todo', { startDate: '2099-01-05', createdAt: '2026-11-02T15:00:00Z' }))
    mount()
    expect(await screen.findByText('From Lead')).toBeInTheDocument()
    expect(screen.getByText(/^Starts .*Jan 5$/)).toBeInTheDocument()
    expect(screen.queryByText(/Created|Nov 2/)).not.toBeInTheDocument()
  })

  it('shows when the work was finished, in Central time', async () => {
    // 21:42 UTC = 3:42 PM Central (CST) on Nov 10
    vi.mocked(getTask).mockResolvedValue(task('done', { doneAt: '2026-11-10T21:42:00Z' }))
    mount()
    expect(await screen.findByText('Finished Nov 10, 3:42 PM')).toBeInTheDocument()
  })
})
