import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getMyProfile, listProfiles } from '../../data/profiles'
import { getProject, listProjects } from '../../data/projects'
import { deleteTaskAttachment, listTaskAttachments, uploadTaskAttachments } from '../../data/taskAttachments'
import { createTask, getTask, listTasks, updateTask } from '../../data/tasks'
import { listFindings } from '../../data/findings'
import { hedi, khaushik, lead, makeAttachment, makeTask } from '../../test/factories'
import { auth } from '../../test/mockAuth'
import { renderApp } from '../../test/renderApp'

vi.mock('../../data/auth', () => import('../../test/mockAuth').then((m) => m.authModule))
vi.mock('../../data/profiles', () => import('../../test/mockData').then((m) => m.profilesModule))
vi.mock('../../data/projects', () => import('../../test/mockData').then((m) => m.projectsModule))
vi.mock('../../data/tasks', () => import('../../test/mockData').then((m) => m.tasksModule))
vi.mock('../../data/findings', () => import('../../test/mockData').then((m) => m.findingsModule))
vi.mock('../../data/taskAttachments', () => import('../../test/mockData').then((m) => m.taskAttachmentsModule))
// Real compression needs a canvas; pretend every screenshot comes out as a small WebP.
vi.mock('../findings/compress', () => ({
  compressScreenshot: vi.fn(async () => new Blob(['webp'], { type: 'image/webp' })),
}))

const pdf = () => new File(['%PDF-1.7'], 'test-plan.pdf', { type: 'application/pdf' })

async function fillRequired() {
  await userEvent.type(await screen.findByLabelText('Title'), 'Retest login')
  await screen.findByRole('option', { name: 'Khaushik' })
  await userEvent.selectOptions(screen.getByLabelText('Assignee'), khaushik.id)
}

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

  it('creates a task with no project when the project is left empty', async () => {
    vi.mocked(createTask).mockResolvedValue(makeTask({ projectId: null }))
    renderApp('/tasks/new')
    await userEvent.type(await screen.findByLabelText('Title'), 'Order new test phones')
    await screen.findByRole('option', { name: 'Khaushik' })
    await userEvent.selectOptions(screen.getByLabelText('Assignee'), khaushik.id)
    expect(screen.getByLabelText('Project (optional)')).toHaveValue('')
    await userEvent.click(screen.getByRole('button', { name: 'Save task' }))

    expect(createTask).toHaveBeenCalledWith({
      projectId: null,
      title: 'Order new test phones',
      assignedTo: khaushik.id,
      explanation: null,
      deadline: null,
    })
  })

  it('uploads attached files after creating the task, keeping their real names', async () => {
    vi.mocked(createTask).mockResolvedValue(makeTask({ id: 't9', projectId: 'p1' }))
    renderApp('/tasks/new?projectId=p1')
    await fillRequired()
    await userEvent.upload(screen.getByLabelText('Add files'), [
      pdf(),
      new File(['png'], 'crash.png', { type: 'image/png' }),
    ])
    expect(screen.getByText(/test-plan\.pdf/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save task' }))

    expect(uploadTaskAttachments).toHaveBeenCalledWith(
      't9',
      [
        { blob: expect.any(File), fileName: 'test-plan.pdf', mimeType: 'application/pdf' },
        // screenshots are re-encoded, and the name follows the new format
        { blob: expect.any(Blob), fileName: 'crash.webp', mimeType: 'image/webp' },
      ],
      0,
    )
    expect(await screen.findByRole('heading', { name: 'Mobile App QA' })).toBeInTheDocument()
  })

  it('rejects disallowed and oversized files with a message', async () => {
    // applyAccept: false = behave like drag-and-drop, which ignores the picker's accept filter
    const user = userEvent.setup({ applyAccept: false })
    renderApp('/tasks/new')
    const input = await screen.findByLabelText('Add files')

    await user.upload(input, new File(['MZ'], 'setup.exe', { type: 'application/x-msdownload' }))
    expect(screen.getByRole('alert')).toHaveTextContent("“setup.exe” isn't allowed")

    const big = pdf()
    Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 })
    await user.upload(input, big)
    expect(screen.getByRole('alert')).toHaveTextContent('Max 10.0 MB per file')
    // Neither file made it into the list (the alert mentions the name, so check for its Remove button).
    expect(screen.queryByRole('button', { name: /^Remove / })).not.toBeInTheDocument()
  })

  it('opens the task with a warning when some uploads fail (the task itself is saved)', async () => {
    const saved = makeTask({ id: 't9', title: 'Retest login', assignedTo: khaushik.id, createdBy: lead.id })
    vi.mocked(createTask).mockResolvedValue(saved)
    vi.mocked(getTask).mockResolvedValue(saved)
    vi.mocked(uploadTaskAttachments).mockResolvedValue({ uploaded: 0, failed: 1 })
    renderApp('/tasks/new')
    await fillRequired()
    await userEvent.upload(screen.getByLabelText('Add files'), pdf())
    await userEvent.click(screen.getByRole('button', { name: 'Save task' }))

    expect(await screen.findByText('1 attachment(s) failed to upload. Edit the task to retry.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Retest login' })).toBeInTheDocument()
  })

  it('removes a saved attachment only when the edit is saved', async () => {
    const existing = makeTask({ id: 't1', title: 'Retest login', assignedTo: khaushik.id, createdBy: lead.id })
    const attachment = makeAttachment({ id: 'a1', taskId: 't1', fileName: 'old-plan.pdf', position: 3, uploadedBy: lead.id })
    vi.mocked(listTasks).mockResolvedValue([existing])
    vi.mocked(listTaskAttachments).mockResolvedValue([attachment])
    vi.mocked(updateTask).mockResolvedValue(existing)
    renderApp('/tasks/t1/edit')

    await userEvent.click(await screen.findByRole('button', { name: 'Remove saved old-plan.pdf' }))
    expect(screen.queryByText(/old-plan\.pdf/)).not.toBeInTheDocument()
    expect(deleteTaskAttachment).not.toHaveBeenCalled() // nothing is deleted until Save

    await userEvent.upload(screen.getByLabelText('Add files'), pdf())
    await userEvent.click(screen.getByRole('button', { name: 'Save task' }))

    expect(deleteTaskAttachment).toHaveBeenCalledWith(attachment)
    // new files go after the highest saved position, so order is stable
    expect(uploadTaskAttachments).toHaveBeenCalledWith('t1', [expect.objectContaining({ fileName: 'test-plan.pdf' })], 4)
  })

  it("shows the assignee's proof to the creator, without letting them remove it", async () => {
    auth.signedInAs(hedi.id)
    vi.mocked(getMyProfile).mockResolvedValue(hedi)
    const existing = makeTask({ id: 't1', title: 'Retest login', assignedTo: khaushik.id, createdBy: hedi.id })
    vi.mocked(listTasks).mockResolvedValue([existing])
    vi.mocked(listTaskAttachments).mockResolvedValue([
      makeAttachment({ taskId: 't1', fileName: 'brief.pdf', uploadedBy: hedi.id }),
      makeAttachment({ taskId: 't1', fileName: 'proof.pdf', uploadedBy: khaushik.id }),
    ])
    renderApp('/tasks/t1/edit')

    expect(await screen.findByRole('button', { name: 'Remove saved brief.pdf' })).toBeInTheDocument()
    expect(screen.getByText(/proof\.pdf/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove saved proof.pdf' })).not.toBeInTheDocument()
  })
})
