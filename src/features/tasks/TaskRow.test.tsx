import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { setTaskStatus } from '../../data/tasks'
import { hedi, khaushik, lead, makeTask } from '../../test/factories'
import { renderWithProviders } from '../../test/renderApp'
import { TaskRow } from './TaskRow'

vi.mock('../../data/tasks', () => import('../../test/mockData').then((m) => m.tasksModule))
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
})
