import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listProfiles } from '../../data/profiles'
import { listUnseen } from '../../data/reads'
import { hedi, khaushik, lead, makeFinding, makeTask } from '../../test/factories'
import { renderWithProviders } from '../../test/renderPage'
import { PersonColumn } from './PersonColumn'

vi.mock('../../data/profiles', () => import('../../test/mockData').then((m) => m.profilesModule))
vi.mock('../../data/reads', () => import('../../test/mockData').then((m) => m.readsModule))
vi.mock('../../data/tasks', () => import('../../test/mockData').then((m) => m.tasksModule))
vi.mock('../../data/checklist', () => import('../../test/mockData').then((m) => m.checklistModule))

function show(tasks = [makeTask()], findings = [makeFinding()]) {
  return renderWithProviders(
    <PersonColumn
      person={hedi}
      tasks={tasks}
      findings={findings}
      viewedDate="2026-10-29"
      isToday
      me={khaushik}
      projectName={() => 'Mobile App QA'}
      personName={(id) => (id === lead.id ? 'Lead' : undefined)}
    />,
  )
}

describe('PersonColumn', () => {
  beforeEach(() => {
    vi.mocked(listProfiles).mockResolvedValue([hedi, khaushik, lead])
    vi.mocked(listUnseen).mockResolvedValue([])
  })

  it('puts blocked tasks first, under their own heading', () => {
    show([
      makeTask({ title: 'Plain task' }),
      makeTask({ title: 'Stuck task', status: 'blocked', blockedReason: 'No device' }),
    ], [])
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(headings[0]).toBe('Blocked')
    expect(screen.getByText('Stuck task')).toBeInTheDocument()
  })

  it('shows the NEW dot on an unseen finding only', async () => {
    vi.mocked(listUnseen).mockResolvedValue([{ type: 'finding', id: 'f-new' }])
    show([], [
      makeFinding({ id: 'f-new', title: 'Fresh finding' }),
      makeFinding({ id: 'f-old', title: 'Old finding' }),
    ])
    const fresh = screen.getByText('Fresh finding').closest('li') as HTMLElement
    expect(await within(fresh).findByLabelText('New')).toBeInTheDocument()
    const old = screen.getByText('Old finding').closest('li') as HTMLElement
    expect(within(old).queryByLabelText('New')).toBeNull()
  })

  it('shows the NEW dot on an unseen task row', async () => {
    vi.mocked(listUnseen).mockResolvedValue([{ type: 'task', id: 't-new' }])
    show([makeTask({ id: 't-new', title: 'Fresh task' })], [])
    const row = screen.getByText('Fresh task').closest('li') as HTMLElement
    expect(await within(row).findByLabelText('New')).toBeInTheDocument()
  })
})
