import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setTaskStatus } from '../../data/tasks'
import { listChecklist } from '../../data/checklist'
import { hedi, khaushik, lead, makeChecklistItem, makeTask } from '../../test/factories'
import { renderWithProviders } from '../../test/renderApp'
import { TaskRow } from './TaskRow'

vi.mock('../../data/tasks', () => import('../../test/mockData').then((m) => m.tasksModule))
vi.mock('../../data/checklist', () => import('../../test/mockData').then((m) => m.checklistModule))
vi.mock('../../lib/dates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/dates')>()),
  todayInTeamTz: () => '2026-10-29',
}))

describe('TaskRow', () => {
  it('flags an open task past its deadline as overdue', () => {
    renderWithProviders(<TaskRow task={makeTask({ deadline: '2026-10-28' })} assigneeName="Hedi" me={hedi} />)
    expect(screen.getByText('Overdue')).toBeInTheDocument()
  })

  it('does not flag a task due today', () => {
    renderWithProviders(<TaskRow task={makeTask({ deadline: '2026-10-29' })} assigneeName="Hedi" me={hedi} />)
    expect(screen.queryByText('Overdue')).not.toBeInTheDocument()
  })

  it("disables the done checkbox on someone else's task", () => {
    const task = makeTask({ title: 'Theirs', assignedTo: khaushik.id, createdBy: lead.id })
    renderWithProviders(<TaskRow task={task} assigneeName="Khaushik" me={hedi} />)
    expect(screen.getByRole('checkbox', { name: 'Mark “Theirs” done' })).toBeDisabled()
  })

  it('marks your own task done', async () => {
    const task = makeTask({ id: 't1', title: 'Mine', assignedTo: hedi.id, createdBy: lead.id })
    vi.mocked(setTaskStatus).mockResolvedValue({ ...task, status: 'submitted' })
    renderWithProviders(<TaskRow task={task} assigneeName="Hedi" me={hedi} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Mark “Mine” done' }))
    expect(setTaskStatus).toHaveBeenCalledWith('t1', 'submitted')
  })

  it('shows edit/delete only to the creator or lead', () => {
    const task = makeTask({ createdBy: lead.id, assignedTo: hedi.id })
    const { unmount } = renderWithProviders(<TaskRow task={task} assigneeName="Hedi" me={hedi} />)
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument()
    unmount()
    renderWithProviders(<TaskRow task={task} assigneeName="Hedi" me={lead} />)
    expect(screen.getByRole('link', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('expands to show the explanation with line breaks', async () => {
    renderWithProviders(<TaskRow task={makeTask({ explanation: 'Step 1\nStep 2' })} assigneeName="Hedi" me={hedi} />)
    await userEvent.click(screen.getByRole('button', { name: 'Details' }))
    const text = screen.getByText(/Step 1/)
    // Rendered as Markdown: a single Enter becomes a real <br>.
    expect(text.querySelector('br')).not.toBeNull()
    expect(text.textContent).toMatch(/Step 1\s*Step 2/)
  })
})

describe('TaskRow with the review flow', () => {
  it('links the title to the task page', () => {
    renderWithProviders(<TaskRow task={makeTask({ id: 't9', title: 'Retest' })} me={hedi} />)
    expect(screen.getByRole('link', { name: 'Retest' })).toHaveAttribute('href', '/tasks/t9')
  })

  it('shows a sent-back task with its badge instead of a checkbox', () => {
    renderWithProviders(<TaskRow task={makeTask({ title: 'Fix me', status: 'changes_requested' })} me={hedi} />)
    expect(screen.getByText('Changes requested')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('lets the assignee untick a done task until the lead reviews it', async () => {
    const task = makeTask({ id: 't2', title: 'Waiting', assignedTo: hedi.id, status: 'submitted' })
    vi.mocked(setTaskStatus).mockResolvedValue({ ...task, status: 'todo' })
    renderWithProviders(<TaskRow task={task} me={hedi} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Mark “Waiting” done' }))
    expect(setTaskStatus).toHaveBeenCalledWith('t2', 'todo')
  })

  describe('checklist', () => {
    beforeEach(() => vi.clearAllMocks())

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

    it('asks before submitting with unticked items, listing them', async () => {
      const task = makeTask({ id: 't1', title: 'Mine', assignedTo: hedi.id, createdBy: lead.id, checklistTotal: 2, checklistDone: 1 })
      vi.mocked(listChecklist).mockResolvedValue([
        makeChecklistItem({ taskId: 't1', title: 'Reproduce', done: true }),
        makeChecklistItem({ taskId: 't1', title: 'Test on Android 14' }),
      ])
      vi.mocked(setTaskStatus).mockResolvedValue({ ...task, status: 'submitted' })
      renderWithProviders(<TaskRow task={task} assigneeName="Hedi" me={hedi} />)

      await userEvent.click(screen.getByRole('checkbox', { name: 'Mark “Mine” done' }))
      expect(await screen.findByText("1 of 2 checklist items aren't ticked")).toBeInTheDocument()
      expect(await screen.findByText('Test on Android 14')).toBeInTheDocument()
      expect(setTaskStatus).not.toHaveBeenCalled()

      await userEvent.click(screen.getByRole('button', { name: 'Submit anyway' }))
      expect(setTaskStatus).toHaveBeenCalledWith('t1', 'submitted')
    })

    it('submits straight away when everything is ticked', async () => {
      const task = makeTask({ id: 't1', title: 'Mine', assignedTo: hedi.id, createdBy: lead.id, checklistTotal: 2, checklistDone: 2 })
      vi.mocked(setTaskStatus).mockResolvedValue({ ...task, status: 'submitted' })
      renderWithProviders(<TaskRow task={task} assigneeName="Hedi" me={hedi} />)
      await userEvent.click(screen.getByRole('checkbox', { name: 'Mark “Mine” done' }))
      expect(setTaskStatus).toHaveBeenCalledWith('t1', 'submitted')
    })
  })
})
