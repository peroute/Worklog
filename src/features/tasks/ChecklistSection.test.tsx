import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addChecklistItems,
  listChecklist,
  removeChecklistItems,
  setChecklistItemDone,
  setChecklistPositions,
} from '../../data/checklist'
import { listProfiles } from '../../data/profiles'
import type { ChecklistItem, Profile, TaskStatus } from '../../data/types'
import { hedi, khaushik, lead, makeChecklistItem, makeTask } from '../../test/factories'
import { renderWithProviders } from '../../test/renderPage'
import { ChecklistSection } from './ChecklistSection'

vi.mock('../../data/checklist', () => import('../../test/mockData').then((m) => m.checklistModule))
vi.mock('../../data/profiles', () => import('../../test/mockData').then((m) => m.profilesModule))
vi.mock('../../data/tasks', () => import('../../test/mockData').then((m) => m.tasksModule))

// Lead created it, Hedi does the work.
const task = (status: TaskStatus = 'todo') => makeTask({ id: 't1', assignedTo: hedi.id, createdBy: khaushik.id, status })

const items: ChecklistItem[] = [
  makeChecklistItem({ id: 'a', taskId: 't1', title: 'Reproduce', position: 0, done: true, doneBy: hedi.id, doneAt: '2026-11-02T15:00:00Z' }),
  makeChecklistItem({ id: 'b', taskId: 't1', title: 'Fix', position: 1 }),
]

function show(me: Profile, status: TaskStatus = 'todo', list: ChecklistItem[] = items) {
  vi.mocked(listChecklist).mockResolvedValue(list)
  renderWithProviders(<ChecklistSection task={task(status)} me={me} />)
}

describe('ChecklistSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listProfiles).mockResolvedValue([hedi, khaushik, lead])
  })

  it('shows progress and who ticked each item', async () => {
    show(hedi)
    expect(await screen.findByText('1 of 2')).toBeInTheDocument()
    expect(await screen.findByText(/✓ Hedi/)).toBeInTheDocument()
  })

  it('lets the assignee tick and change the list', async () => {
    show(hedi)
    expect(await screen.findByRole('checkbox', { name: 'Fix' })).toBeEnabled()
    expect(screen.getByPlaceholderText('Add an item…')).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Remove Fix' })).toBeInTheDocument()
  })

  it('lets anyone tick and edit, not only the creator or assignee', async () => {
    const stranger: Profile = { id: 'someone-else', displayName: 'Someone' }
    show(stranger, 'in_progress')
    expect(await screen.findByRole('checkbox', { name: 'Fix' })).toBeEnabled()
    expect(screen.getByPlaceholderText('Add an item…')).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Move Fix up' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Remove Fix' })).toBeInTheDocument()
  })

  it('keeps the boxes live while the task waits for review', async () => {
    show(hedi, 'waiting_for_review')
    expect(await screen.findByRole('checkbox', { name: 'Fix' })).toBeEnabled()
  })

  it('ticks an item for a person who is not the assignee', async () => {
    show(lead)
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Fix' }))
    expect(setChecklistItemDone).toHaveBeenCalledWith('b', true)
  })

  it('lets the creator add an item at the end', async () => {
    show(khaushik)
    await userEvent.type(await screen.findByPlaceholderText('Add an item…'), 'Write tests{enter}')
    expect(addChecklistItems).toHaveBeenCalledWith('t1', [{ title: 'Write tests', position: 2 }])
  })

  it('refuses blank and over-long items', async () => {
    show(khaushik)
    const input = await screen.findByPlaceholderText('Add an item…')
    await userEvent.type(input, '   {enter}')
    expect(screen.getByText('Items need 1–200 characters')).toBeInTheDocument()
    await userEvent.clear(input)
    await userEvent.click(input)
    await userEvent.paste('x'.repeat(201))
    await userEvent.keyboard('{enter}')
    expect(addChecklistItems).not.toHaveBeenCalled()
  })

  it('disables adding once the list is full', async () => {
    const full = Array.from({ length: 50 }, (_, i) => makeChecklistItem({ id: `i${i}`, taskId: 't1', position: i }))
    show(khaushik, 'todo', full)
    expect(await screen.findByPlaceholderText('Add an item…')).toBeDisabled()
    expect(screen.getByText('Checklist is full (50 items)')).toBeInTheDocument()
  })

  it('un-ticks the box and explains when the database refuses', async () => {
    vi.mocked(setChecklistItemDone).mockRejectedValue(new Error('only the assignee can tick items'))
    show(hedi)
    const box = await screen.findByRole('checkbox', { name: 'Fix' })
    await userEvent.click(box)
    expect(await screen.findByRole('alert')).toHaveTextContent('only the assignee can tick items')
    await waitFor(() => expect(box).not.toBeChecked())
  })

  it('moves an item down by swapping positions', async () => {
    show(khaushik)
    await userEvent.click(await screen.findByRole('button', { name: 'Move Reproduce down' }))
    expect(setChecklistPositions).toHaveBeenCalledWith(
      expect.arrayContaining([
        { id: 'b', position: 0 },
        { id: 'a', position: 1 },
      ]),
    )
    expect(screen.getByRole('button', { name: 'Move Reproduce up' })).toBeDisabled()
  })

  it('removes an item', async () => {
    show(khaushik)
    await userEvent.click(await screen.findByRole('button', { name: 'Remove Fix' }))
    expect(removeChecklistItems).toHaveBeenCalledWith(['b'])
  })

  it('wraps long unbroken text instead of overflowing', async () => {
    show(hedi)
    const row = (await screen.findByRole('checkbox', { name: 'Fix' })).closest('li') as HTMLElement
    expect(within(row).getByText('Fix')).toHaveClass('break-words')
  })

  it('still offers an empty checklist to anyone, so they can start one', async () => {
    vi.mocked(listChecklist).mockResolvedValue([])
    renderWithProviders(<ChecklistSection task={task()} me={hedi} />)
    expect(await screen.findByPlaceholderText('Add an item…')).toBeEnabled()
  })
})
