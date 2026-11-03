import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listChecklist } from '../../data/checklist'
import { listProfiles } from '../../data/profiles'
import { listUnseen } from '../../data/reads'
import { deleteTask, setTaskStatus } from '../../data/tasks'
import { hedi, khaushik, lead, makeChecklistItem, makeTask } from '../../test/factories'
import { renderWithProviders } from '../../test/renderPage'
import { TaskRow } from './TaskRow'

vi.mock('../../data/tasks', () => import('../../test/mockData').then((m) => m.tasksModule))
vi.mock('../../data/checklist', () => import('../../test/mockData').then((m) => m.checklistModule))
vi.mock('../../data/profiles', () => import('../../test/mockData').then((m) => m.profilesModule))
vi.mock('../../data/reads', () => import('../../test/mockData').then((m) => m.readsModule))
vi.mock('../../lib/dates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/dates')>()),
  todayInTeamTz: () => '2026-10-29',
}))

beforeEach(() => {
  vi.mocked(listProfiles).mockResolvedValue([hedi, khaushik, lead])
  vi.mocked(listUnseen).mockResolvedValue([])
})

describe('TaskRow', () => {
  it('flags an open task past its deadline as overdue', () => {
    renderWithProviders(<TaskRow task={makeTask({ deadline: '2026-10-28' })} assigneeName="Hedi" me={hedi} />)
    expect(screen.getByText('Overdue')).toBeInTheDocument()
  })

  it('does not flag a task due today', () => {
    renderWithProviders(<TaskRow task={makeTask({ deadline: '2026-10-29' })} assigneeName="Hedi" me={hedi} />)
    expect(screen.queryByText('Overdue')).not.toBeInTheDocument()
  })

  it('does not flag a finished task as overdue', () => {
    renderWithProviders(<TaskRow task={makeTask({ deadline: '2026-10-28', status: 'done' })} me={hedi} />)
    expect(screen.queryByText('Overdue')).not.toBeInTheDocument()
  })

  it('anyone sees Edit/Delete', () => {
    // Khaushik neither created nor owns this task, and it is already done: still editable.
    const task = makeTask({ createdBy: lead.id, assignedTo: hedi.id, status: 'done' })
    renderWithProviders(<TaskRow task={task} assigneeName="Hedi" me={khaushik} />)
    expect(screen.getByRole('link', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('says delete moves the task to Trash, then deletes', async () => {
    const task = makeTask({ id: 't1', title: 'Old plan' })
    vi.mocked(deleteTask).mockResolvedValue(undefined)
    renderWithProviders(<TaskRow task={task} me={khaushik} />)
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent(/Trash/)
    expect(deleteTask).not.toHaveBeenCalled()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete task' }))
    expect(deleteTask).toHaveBeenCalledWith('t1')
  })

  it('expands to show the explanation with line breaks', async () => {
    renderWithProviders(<TaskRow task={makeTask({ explanation: 'Step 1\nStep 2' })} assigneeName="Hedi" me={hedi} />)
    await userEvent.click(screen.getByRole('button', { name: 'Details' }))
    const text = screen.getByText(/Step 1/)
    // Rendered as Markdown: a single Enter becomes a real <br>.
    expect(text.querySelector('br')).not.toBeNull()
    expect(text.textContent).toMatch(/Step 1\s*Step 2/)
  })

  it('links the title to the task page', () => {
    renderWithProviders(<TaskRow task={makeTask({ id: 't9', title: 'Retest' })} me={hedi} />)
    expect(screen.getByRole('link', { name: 'Retest' })).toHaveAttribute('href', '/tasks/t9')
  })

  it('labels a task that has not started yet with its start day', () => {
    renderWithProviders(<TaskRow task={makeTask({ startDate: '2026-11-03' })} me={hedi} />)
    expect(screen.getByText('Starts Tue, Nov 3')).toBeInTheDocument()
  })

  it('drops the start label once the start day has come', () => {
    renderWithProviders(<TaskRow task={makeTask({ startDate: '2026-10-29' })} me={hedi} />)
    expect(screen.queryByText(/^Starts/)).not.toBeInTheDocument()
  })

  it('shows who created the task', () => {
    renderWithProviders(<TaskRow task={makeTask({ createdBy: lead.id })} creatorName="Lead" me={hedi} />)
    expect(screen.getByText('From Lead')).toBeInTheDocument()
  })

  describe('NEW dot', () => {
    it('shows for a task in the unseen list', async () => {
      vi.mocked(listUnseen).mockResolvedValue([{ type: 'task', id: 't1' }])
      renderWithProviders(<TaskRow task={makeTask({ id: 't1' })} me={hedi} />)
      expect(await screen.findByLabelText('New')).toBeInTheDocument()
    })

    it('NEW dot for unseen task: not for a seen one, nor for a finding with the same id', async () => {
      vi.mocked(listUnseen).mockResolvedValue([{ type: 'finding', id: 't1' }])
      renderWithProviders(<TaskRow task={makeTask({ id: 't1' })} me={hedi} />)
      await waitFor(() => expect(listUnseen).toHaveBeenCalled())
      expect(screen.queryByLabelText('New')).not.toBeInTheDocument()
    })
  })

  describe('status buttons', () => {
    it("shows the buttons when it is the person's turn", async () => {
      renderWithProviders(<TaskRow task={makeTask({ assignedTo: hedi.id })} me={hedi} />)
      expect(await screen.findByRole('button', { name: 'Start' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'More' })).not.toBeInTheDocument()
    })

    it("tucks them under More when it is someone else's turn", async () => {
      renderWithProviders(<TaskRow task={makeTask({ assignedTo: hedi.id })} me={khaushik} />)
      expect(await screen.findByRole('button', { name: 'More' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument()
    })

    it('starts the task', async () => {
      const task = makeTask({ id: 't1', assignedTo: hedi.id })
      vi.mocked(setTaskStatus).mockResolvedValue()
      renderWithProviders(<TaskRow task={task} me={hedi} />)
      await userEvent.click(await screen.findByRole('button', { name: 'Start' }))
      expect(setTaskStatus).toHaveBeenCalledWith('t1', 'in_progress', {})
    })

    it('asks for a reason before blocking', async () => {
      const task = makeTask({ id: 't1', assignedTo: hedi.id })
      vi.mocked(setTaskStatus).mockResolvedValue()
      renderWithProviders(<TaskRow task={task} me={hedi} />)
      await userEvent.click(await screen.findByRole('button', { name: 'Blocked…' }))
      expect(setTaskStatus).not.toHaveBeenCalled()

      const dialog = await screen.findByRole('dialog')
      await userEvent.type(within(dialog).getByLabelText("What's blocking it?"), 'Waiting on a test device')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Blocked…' }))
      expect(setTaskStatus).toHaveBeenCalledWith('t1', 'blocked', { reason: 'Waiting on a test device' })
    })

    it('finishing a task that needs review sends it to review', async () => {
      const task = makeTask({ id: 't1', assignedTo: hedi.id, needsReview: true, status: 'in_progress' })
      vi.mocked(setTaskStatus).mockResolvedValue()
      renderWithProviders(<TaskRow task={task} me={hedi} />)
      await userEvent.click(await screen.findByRole('button', { name: 'Mark done' }))
      expect(setTaskStatus).toHaveBeenCalledWith('t1', 'waiting_for_review', {})
    })

    it('shows the status badge once it is past To do', () => {
      renderWithProviders(<TaskRow task={makeTask({ status: 'waiting_for_review' })} me={hedi} />)
      expect(screen.getByText('Waiting for review')).toBeInTheDocument()
    })

    it('shows the refusal when the database says no', async () => {
      const task = makeTask({ id: 't1', assignedTo: hedi.id })
      vi.mocked(setTaskStatus).mockRejectedValue(new Error('someone already moved it'))
      renderWithProviders(<TaskRow task={task} me={hedi} />)
      await userEvent.click(await screen.findByRole('button', { name: 'Start' }))
      expect(await screen.findByText(/someone already moved it/)).toBeInTheDocument()
    })
  })

  describe('checklist', () => {
    it('shows progress as a chip', () => {
      renderWithProviders(<TaskRow task={makeTask({ checklistTotal: 5, checklistDone: 2 })} assigneeName="Hedi" me={hedi} />)
      expect(screen.getByTitle('2 of 5 checklist items done')).toHaveTextContent('2/5')
    })

    it('shows no chip without a checklist', () => {
      renderWithProviders(<TaskRow task={makeTask()} assigneeName="Hedi" me={hedi} />)
      expect(screen.queryByTitle(/checklist items done/)).toBeNull()
    })

    it('turns the chip green when everything is ticked', () => {
      renderWithProviders(<TaskRow task={makeTask({ checklistTotal: 3, checklistDone: 3 })} assigneeName="Hedi" me={hedi} />)
      expect(screen.getByTitle('3 of 3 checklist items done')).toHaveClass('text-done')
    })

    it('asks before finishing with unticked items, listing them', async () => {
      const task = makeTask({ id: 't1', assignedTo: hedi.id, checklistTotal: 2, checklistDone: 1 })
      vi.mocked(listChecklist).mockResolvedValue([
        makeChecklistItem({ taskId: 't1', title: 'Reproduce', done: true }),
        makeChecklistItem({ taskId: 't1', title: 'Test on Android 14' }),
      ])
      vi.mocked(setTaskStatus).mockResolvedValue()
      renderWithProviders(<TaskRow task={task} assigneeName="Hedi" me={hedi} />)

      await userEvent.click(await screen.findByRole('button', { name: 'Mark done' }))
      expect(await screen.findByText("1 of 2 checklist items aren't ticked")).toBeInTheDocument()
      expect(await screen.findByText('Test on Android 14')).toBeInTheDocument()
      expect(setTaskStatus).not.toHaveBeenCalled()

      await userEvent.click(screen.getByRole('button', { name: 'Finish anyway' }))
      expect(setTaskStatus).toHaveBeenCalledWith('t1', 'done', {})
    })

    it('finishes straight away when everything is ticked', async () => {
      const task = makeTask({ id: 't1', assignedTo: hedi.id, checklistTotal: 2, checklistDone: 2 })
      vi.mocked(setTaskStatus).mockResolvedValue()
      renderWithProviders(<TaskRow task={task} assigneeName="Hedi" me={hedi} />)
      await userEvent.click(await screen.findByRole('button', { name: 'Mark done' }))
      expect(setTaskStatus).toHaveBeenCalledWith('t1', 'done', {})
    })
  })
})
