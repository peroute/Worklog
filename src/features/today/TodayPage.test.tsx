import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listFindings } from '../../data/findings'
import { getMyProfile, listProfiles } from '../../data/profiles'
import { listProjects } from '../../data/projects'
import { listTasks } from '../../data/tasks'
import type { ProjectSummary } from '../../data/types'
import { hedi, khaushik, lead, makeFinding, makeTask } from '../../test/factories'
import { auth } from '../../test/mockAuth'
import { renderApp } from '../../test/renderApp'

vi.mock('../../data/auth', () => import('../../test/mockAuth').then((m) => m.authModule))
vi.mock('../../data/profiles', () => import('../../test/mockData').then((m) => m.profilesModule))
vi.mock('../../data/projects', () => import('../../test/mockData').then((m) => m.projectsModule))
vi.mock('../../data/tasks', () => import('../../test/mockData').then((m) => m.tasksModule))
vi.mock('../../data/findings', () => import('../../test/mockData').then((m) => m.findingsModule))
vi.mock('../../lib/dates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/dates')>()),
  todayInTeamTz: () => '2026-10-29',
}))

const qa: ProjectSummary = {
  id: 'project-1',
  name: 'Mobile App QA',
  description: null,
  createdBy: lead.id,
  createdAt: '',
  openFindings: 4,
  openTasks: 2,
}

const columnNames = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
const column = (name: string) => screen.getByRole('region', { name })

describe('TodayPage', () => {
  beforeEach(() => {
    auth.signedInAs(lead.id)
    vi.mocked(getMyProfile).mockResolvedValue(lead)
    vi.mocked(listProfiles).mockResolvedValue([lead, khaushik, hedi])
    vi.mocked(listProjects).mockResolvedValue([qa])
    vi.mocked(listTasks).mockResolvedValue([
      makeTask({ title: 'Overdue one', assignedTo: hedi.id, deadline: '2026-10-28' }),
      makeTask({ title: 'Upcoming one', assignedTo: hedi.id, deadline: '2026-11-05' }),
      // 03:00 UTC Oct 30 = 22:00 Central Oct 29
      makeTask({ title: 'Done one', assignedTo: hedi.id, status: 'submitted', doneAt: '2026-10-30T03:00:00Z' }),
    ])
    vi.mocked(listFindings).mockResolvedValue([
      makeFinding({ title: 'Login crash', authorId: hedi.id, projectId: 'project-1', imageCount: 2 }),
    ])
  })

  it('shows one column per member, sorted, and hides an idle lead', async () => {
    renderApp('/')
    await screen.findByRole('region', { name: 'Hedi' })
    expect(columnNames()).toEqual(['Hedi', 'Khaushik'])
  })

  it("adds the lead's column when they have an open task", async () => {
    vi.mocked(listTasks).mockResolvedValue([makeTask({ title: 'Lead todo', assignedTo: lead.id })])
    renderApp('/')
    await screen.findByRole('region', { name: 'Lead' })
    expect(columnNames()).toEqual(['Hedi', 'Khaushik', 'Lead'])
  })

  it("counts and groups a person's tasks for the day", async () => {
    renderApp('/')
    const hediColumn = await screen.findByRole('region', { name: 'Hedi' })
    expect(within(hediColumn).getByText('done today 1 · open 2')).toBeInTheDocument()
    const groups = within(hediColumn)
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent)
    expect(groups).toEqual(['Due / Overdue', 'Upcoming', 'Completed', 'Findings'])
    expect(within(hediColumn).getByRole('link', { name: /Login crash/ })).toHaveTextContent('📷 2')
    expect(within(hediColumn).getByRole('link', { name: /Login crash/ })).toHaveTextContent('Mobile App QA')
  })

  it("goes to the previous day and loads that day's findings", async () => {
    renderApp('/')
    await screen.findByRole('region', { name: 'Hedi' })
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Thu, Oct 29')
    await userEvent.click(screen.getByRole('button', { name: 'Previous day' }))
    expect(await screen.findByRole('heading', { level: 1, name: /Wed, Oct 28/ })).toBeInTheDocument()
    // All findings are loaded once; the page shows only the viewed day's (fixture is dated Oct 29).
    expect(within(column('Hedi')).queryByText('Login crash')).not.toBeInTheDocument()
    expect(within(column('Hedi')).getByText('done 0 · open 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to today' })).toBeInTheDocument()
  })

  it('opens directly on a date from the URL', async () => {
    renderApp('/?date=2026-10-27')
    expect(await screen.findByRole('heading', { level: 1, name: /Tue, Oct 27/ })).toBeInTheDocument()
  })

  it("sums up the team's day in a summary strip", async () => {
    renderApp('/')
    const summary = await screen.findByRole('region', { name: 'Day summary' })
    const tile = (label: string) => within(summary).getByText(label).parentElement
    // Waiting for lead = Login crash (submitted finding) + Done one (submitted task, not yet reviewed).
    expect(tile('Waiting for lead')).toHaveTextContent('2')
    expect(tile('Changes requested')).toHaveTextContent('0')
    expect(tile('Overdue')).toHaveTextContent('1')
    expect(tile('Done today')).toHaveTextContent('1')
  })

  it("puts work with changes requested at the top of the person's column", async () => {
    vi.mocked(listTasks).mockResolvedValue([
      makeTask({ title: 'Upcoming one', assignedTo: hedi.id, deadline: '2026-11-05' }),
      makeTask({ title: 'Sent back one', assignedTo: hedi.id, status: 'changes_requested' }),
    ])
    renderApp('/')
    const hediColumn = await screen.findByRole('region', { name: 'Hedi' })
    const groups = within(hediColumn)
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent)
    expect(groups[0]).toBe('Changes requested')
    expect(within(hediColumn).getByText('Changes requested', { selector: 'span' })).toBeInTheDocument()
  })

  it('shows empty states on a brand-new workspace', async () => {
    vi.mocked(listProjects).mockResolvedValue([])
    vi.mocked(listTasks).mockResolvedValue([])
    vi.mocked(listFindings).mockResolvedValue([])
    renderApp('/')
    await screen.findByRole('region', { name: 'Hedi' })
    expect(within(column('Hedi')).getByText('Nothing logged yet.')).toBeInTheDocument()
    expect(within(column('Khaushik')).getByText('Nothing logged yet.')).toBeInTheDocument()
    expect(screen.getByText('No projects yet — create the first one.')).toBeInTheDocument()
  })

  it('lists projects with open counts and offers the main actions', async () => {
    renderApp('/')
    expect(await screen.findByRole('link', { name: 'Mobile App QA · 4 open' })).toHaveAttribute(
      'href',
      '/projects/project-1',
    )
    expect(screen.getByRole('link', { name: '+ Log finding' })).toHaveAttribute('href', '/findings/new')
    expect(screen.getByRole('link', { name: '+ Assign task' })).toHaveAttribute('href', '/tasks/new')
  })
})
