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

  it('disables the done checkbox on someone else\'s task', () => {
    const task = makeTask({ title: 'Theirs', assignedTo: khaushik.id, createdBy: lead.id })
    renderWithProviders(<TaskRow task={task} assigneeName="Khaushik" me={hedi} />)
    expect(screen.getByRole('checkbox', { name: 'Mark “Theirs” done' })).toBeDisabled()
  })

  it('marks your own task done', async () => {
    const task = makeTask({ id: 't1', title: 'Mine', assignedTo: hedi.id, createdBy: lead.id })
    vi.mocked(setTaskStatus).mockResolvedValue({ ...task, status: 'done' })
    renderWithProviders(<TaskRow task={task} assigneeName="Hedi" me={hedi} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Mark “Mine” done' }))
    expect(setTaskStatus).toHaveBeenCalledWith('t1', 'done')
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
    renderWithProviders(
      <TaskRow task={makeTask({ explanation: 'Step 1\nStep 2' })} assigneeName="Hedi" me={hedi} />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Details' }))
    const text = screen.getByText(/Step 1/)
    expect(text).toHaveClass('whitespace-pre-wrap')
    expect(text.textContent).toBe('Step 1\nStep 2')
  })
})
