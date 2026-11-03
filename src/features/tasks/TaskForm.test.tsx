import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getMyProfile, listProfiles } from '../../data/profiles'
import { getProject, listProjects } from '../../data/projects'
import { deleteTaskAttachment, listTaskAttachments, uploadTaskAttachments } from '../../data/taskAttachments'
import { createTask, getTask, listTasks, updateTask } from '../../data/tasks'
import { listFindings } from '../../data/findings'
import { addChecklistItems, listChecklist, removeChecklistItems, setChecklistPositions } from '../../data/checklist'
import { hedi, khaushik, lead, makeAttachment, makeChecklistItem, makeTask } from '../../test/factories'
import { auth } from '../../test/mockAuth'
import { renderPage } from '../../test/renderPage'
import { ProjectPage } from '../projects/ProjectPage'
import { TaskDetailPage } from './TaskDetailPage'
import { TaskFormPage } from './TaskForm'

vi.mock('../../data/auth', () => import('../../test/mockAuth').then((m) => m.authModule))
vi.mock('../../data/profiles', () => import('../../test/mockData').then((m) => m.profilesModule))
vi.mock('../../data/projects', () => import('../../test/mockData').then((m) => m.projectsModule))
vi.mock('../../data/tasks', () => import('../../test/mockData').then((m) => m.tasksModule))
vi.mock('../../data/findings', () => import('../../test/mockData').then((m) => m.findingsModule))
vi.mock('../../data/taskAttachments', () => import('../../test/mockData').then((m) => m.taskAttachmentsModule))
vi.mock('../../data/checklist', () => import('../../test/mockData').then((m) => m.checklistModule))
vi.mock('../../data/comments', () => import('../../test/mockData').then((m) => m.commentsModule))
vi.mock('../../data/activity', () => import('../../test/mockData').then((m) => m.activityModule))
vi.mock('../../data/reads', () => import('../../test/mockData').then((m) => m.readsModule))
vi.mock('../../data/images', () => import('../../test/mockData').then((m) => m.imagesModule))
// Real compression needs a canvas; pretend every screenshot comes out as a small WebP.
// Pin "today" so the default start day is predictable.
vi.mock('../../lib/dates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/dates')>()),
  todayInTeamTz: () => '2026-11-02',
}))
vi.mock('../findings/compress', () => ({
  compressScreenshot: vi.fn(async () => new Blob(['webp'], { type: 'image/webp' })),
}))

const pdf = () => new File(['%PDF-1.7'], 'test-plan.pdf', { type: 'application/pdf' })

async function fillRequired() {
  await userEvent.type(await screen.findByLabelText('Title'), 'Retest login')
  await screen.findByRole('option', { name: 'Khaushik' })
  await userEvent.selectOptions(screen.getByLabelText('Assignee'), khaushik.id)
}

const project = {
  id: 'p1',
  name: 'Mobile App QA',
  description: null,
  createdBy: lead.id,
  createdAt: '',
  deletedAt: null,
  deletedBy: null,
}

/** Mounts the form at `path` (new or edit), with the pages it navigates to after saving. */
function renderApp(path: string) {
  const editing = path.includes('/edit')
  return renderPage(<TaskFormPage />, {
    path,
    route: editing ? '/tasks/:id/edit' : '/tasks/new',
    others: { '/projects/:id': <ProjectPage />, '/tasks/:id': <TaskDetailPage />, '/tasks': <h1>Tasks</h1> },
  })
}

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
      startDate: '2026-11-02',
      needsReview: false,
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
      startDate: '2026-11-02',
      needsReview: false,
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

  it("opens the editor for someone else's task and lets them remove its brief files", async () => {
    // Hedi neither created this task nor is he the assignee: equal access means he can still edit.
    auth.signedInAs(hedi.id)
    vi.mocked(getMyProfile).mockResolvedValue(hedi)
    const existing = makeTask({ id: 't1', title: 'Retest login', assignedTo: khaushik.id, createdBy: lead.id })
    vi.mocked(listTasks).mockResolvedValue([existing])
    vi.mocked(listTaskAttachments).mockResolvedValue([
      makeAttachment({ taskId: 't1', fileName: 'brief.pdf', uploadedBy: lead.id }),
    ])
    renderApp('/tasks/t1/edit')

    expect(await screen.findByLabelText('Title')).toHaveValue('Retest login')
    expect(screen.getByRole('button', { name: 'Remove saved brief.pdf' })).toBeInTheDocument()
  })

  it('needs review checkbox saves needsReview', async () => {
    vi.mocked(createTask).mockResolvedValue(makeTask())
    renderApp('/tasks/new')
    await fillRequired()
    const box = screen.getByRole('checkbox', { name: 'Needs review' })
    expect(box).not.toBeChecked()
    expect(screen.getByText('Someone else approves it before it counts as done')).toBeInTheDocument()
    await userEvent.click(box)
    await userEvent.click(screen.getByRole('button', { name: 'Save task' }))
    expect(createTask).toHaveBeenCalledWith(expect.objectContaining({ needsReview: true }))
  })

  it('review and assignee locked while waiting for review', async () => {
    const existing = makeTask({
      id: 't1',
      status: 'waiting_for_review',
      needsReview: true,
      submittedBy: hedi.id,
      assignedTo: hedi.id,
    })
    vi.mocked(listTasks).mockResolvedValue([existing])
    vi.mocked(listTaskAttachments).mockResolvedValue([])
    renderApp('/tasks/t1/edit')

    expect(await screen.findByRole('checkbox', { name: 'Needs review' })).toBeDisabled()
    expect(screen.getByLabelText('Assignee')).toBeDisabled()
    expect(screen.getByText('Move it back to In progress to change this')).toBeInTheDocument()
    // Everything else stays editable.
    expect(screen.getByLabelText('Title')).toBeEnabled()
  })

  it('keeps review and assignee editable for a task that is not waiting for review', async () => {
    const existing = makeTask({ id: 't1', status: 'in_progress', needsReview: true })
    vi.mocked(listTasks).mockResolvedValue([existing])
    vi.mocked(listTaskAttachments).mockResolvedValue([])
    renderApp('/tasks/t1/edit')

    expect(await screen.findByRole('checkbox', { name: 'Needs review' })).toBeEnabled()
    expect(screen.getByRole('checkbox', { name: 'Needs review' })).toBeChecked()
    expect(screen.getByLabelText('Assignee')).toBeEnabled()
    expect(screen.queryByText('Move it back to In progress to change this')).not.toBeInTheDocument()
  })

  it('saves checklist items after creating the task', async () => {
    vi.mocked(createTask).mockResolvedValue(makeTask({ id: 'new-task', projectId: 'p1' }))
    renderApp('/tasks/new?projectId=p1')
    await fillRequired()
    const add = screen.getByPlaceholderText('Add an item…')
    await userEvent.type(add, 'Reproduce{enter}')
    await userEvent.type(add, 'Fix{enter}')
    await userEvent.click(screen.getByRole('button', { name: 'Save task' }))
    await vi.waitFor(() =>
      expect(addChecklistItems).toHaveBeenCalledWith('new-task', [
        { title: 'Reproduce', position: 0 },
        { title: 'Fix', position: 1 },
      ]),
    )
  })

  it('deletes checklist items removed while editing', async () => {
    const task = makeTask({ id: 't1', projectId: 'p1', createdBy: lead.id, assignedTo: khaushik.id })
    vi.mocked(listTasks).mockResolvedValue([task])
    vi.mocked(listTaskAttachments).mockResolvedValue([])
    vi.mocked(listChecklist).mockResolvedValue([
      makeChecklistItem({ id: 'a', taskId: 't1', title: 'Reproduce', position: 0 }),
      makeChecklistItem({ id: 'b', taskId: 't1', title: 'Fix', position: 1 }),
    ])
    vi.mocked(updateTask).mockResolvedValue(task)
    renderApp('/tasks/t1/edit')
    await userEvent.click(await screen.findByRole('button', { name: 'Remove Reproduce' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save task' }))
    await vi.waitFor(() => expect(removeChecklistItems).toHaveBeenCalledWith(['a']))
  })

  it('still saves new items when one was deleted in another tab meanwhile', async () => {
    const task = makeTask({ id: 't1', projectId: 'p1', createdBy: lead.id, assignedTo: khaushik.id })
    const a = makeChecklistItem({ id: 'a', taskId: 't1', title: 'Reproduce', position: 0 })
    const x = makeChecklistItem({ id: 'x', taskId: 't1', title: 'Old step', position: 1 })
    const b = makeChecklistItem({ id: 'b', taskId: 't1', title: 'Fix', position: 2 })
    vi.mocked(listTasks).mockResolvedValue([task])
    vi.mocked(listTaskAttachments).mockResolvedValue([])
    vi.mocked(listChecklist)
      .mockResolvedValueOnce([a, x, b]) // when the form opens
      .mockResolvedValue([a, b]) // at save: x was deleted in another tab
    // Like the database: updating a row that no longer exists fails.
    vi.mocked(setChecklistPositions).mockImplementation(async (items) => {
      if (items.some((i) => i.id === 'x')) throw new Error('Cannot coerce the result to a single JSON object')
    })
    vi.mocked(updateTask).mockResolvedValue(task)
    vi.mocked(addChecklistItems).mockClear()
    renderApp('/tasks/t1/edit')
    await userEvent.click(await screen.findByRole('button', { name: 'Remove Reproduce' }))
    await userEvent.type(screen.getByPlaceholderText('Add an item…'), 'Write tests{enter}')
    await userEvent.click(screen.getByRole('button', { name: 'Save task' }))
    await vi.waitFor(() => expect(addChecklistItems).toHaveBeenCalledWith('t1', [{ title: 'Write tests', position: 2 }]))
  })

  it('saves an item typed in the add box even without pressing Enter', async () => {
    vi.mocked(createTask).mockResolvedValue(makeTask({ id: 'new-task', projectId: 'p1' }))
    vi.mocked(addChecklistItems).mockClear()
    renderApp('/tasks/new?projectId=p1')
    await fillRequired()
    await userEvent.type(screen.getByPlaceholderText('Add an item…'), 'Last step')
    await userEvent.click(screen.getByRole('button', { name: 'Save task' }))
    await vi.waitFor(() => expect(addChecklistItems).toHaveBeenCalledWith('new-task', [{ title: 'Last step', position: 0 }]))
  })

  it('starts the task on the day passed from Today', async () => {
    vi.mocked(createTask).mockResolvedValue(makeTask())
    renderApp('/tasks/new?start=2026-11-09')
    await fillRequired()
    expect(screen.getByLabelText('Start day')).toHaveValue('2026-11-09')
    await userEvent.click(screen.getByRole('button', { name: 'Save task' }))
    expect(createTask).toHaveBeenCalledWith(expect.objectContaining({ startDate: '2026-11-09' }))
  })

  it('starts the task today when no day is passed', async () => {
    renderApp('/tasks/new')
    expect(await screen.findByLabelText('Start day')).toHaveValue('2026-11-02')
  })

  it('blocks a deadline before the start day', async () => {
    renderApp('/tasks/new?start=2026-11-09')
    await fillRequired()
    await userEvent.type(screen.getByLabelText('Deadline (optional)'), '2026-11-05')
    await userEvent.click(screen.getByRole('button', { name: 'Save task' }))
    expect(await screen.findByText("Deadline can't be before the start day")).toBeInTheDocument()
    expect(createTask).not.toHaveBeenCalled()
  })

  it('lets the creator move the start day of an existing task', async () => {
    const task = makeTask({ id: 't1', startDate: '2026-11-09', createdBy: lead.id })
    vi.mocked(listTasks).mockResolvedValue([task])
    vi.mocked(listTaskAttachments).mockResolvedValue([])
    vi.mocked(updateTask).mockResolvedValue(task)
    renderApp('/tasks/t1/edit')
    const start = await screen.findByLabelText('Start day')
    expect(start).toHaveValue('2026-11-09')
    await userEvent.clear(start)
    await userEvent.type(start, '2026-11-12')
    await userEvent.click(screen.getByRole('button', { name: 'Save task' }))
    expect(updateTask).toHaveBeenCalledWith('t1', expect.objectContaining({ startDate: '2026-11-12' }))
  })
})
