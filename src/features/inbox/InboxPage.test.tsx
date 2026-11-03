import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listLatestComments } from '../../data/comments'
import { listFindings } from '../../data/findings'
import { getMyProfile, listProfiles } from '../../data/profiles'
import { listProjects } from '../../data/projects'
import { listUnseen } from '../../data/reads'
import { listTasks } from '../../data/tasks'
import { hedi, khaushik, lead, makeFinding, makeTask } from '../../test/factories'
import { auth } from '../../test/mockAuth'
import { renderApp } from '../../test/renderApp'

vi.mock('../../data/auth', () => import('../../test/mockAuth').then((m) => m.authModule))
vi.mock('../../data/profiles', () => import('../../test/mockData').then((m) => m.profilesModule))
vi.mock('../../data/projects', () => import('../../test/mockData').then((m) => m.projectsModule))
vi.mock('../../data/tasks', () => import('../../test/mockData').then((m) => m.tasksModule))
vi.mock('../../data/findings', () => import('../../test/mockData').then((m) => m.findingsModule))
vi.mock('../../data/comments', () => import('../../test/mockData').then((m) => m.commentsModule))
vi.mock('../../data/reads', () => import('../../test/mockData').then((m) => m.readsModule))
vi.mock('../../data/checklist', () => import('../../test/mockData').then((m) => m.checklistModule))

function signInAs(profile: typeof hedi) {
  auth.signedInAs(profile.id)
  vi.mocked(getMyProfile).mockResolvedValue(profile)
}

describe('InboxPage', () => {
  beforeEach(() => {
    vi.mocked(listProfiles).mockResolvedValue([hedi, khaushik, lead])
    vi.mocked(listProjects).mockResolvedValue([
      { id: 'project-1', name: 'Mobile App QA', description: null, createdBy: lead.id, createdAt: '', openFindings: 0, openTasks: 0, deletedAt: null, deletedBy: null },
    ])
    vi.mocked(listUnseen).mockResolvedValue([])
    vi.mocked(listFindings).mockResolvedValue([
      makeFinding({ id: 'f-fixed', title: 'Login crash', authorId: hedi.id, status: 'fixed', fixedBy: lead.id }),
    ])
    vi.mocked(listTasks).mockResolvedValue([
      makeTask({ id: 't-out', title: 'Handed out task', createdBy: hedi.id, assignedTo: khaushik.id, status: 'in_progress' }),
      makeTask({ id: 't-stuck', title: 'Stuck task', createdBy: lead.id, assignedTo: hedi.id, status: 'blocked', blockedReason: 'No device' }),
    ])
    vi.mocked(listLatestComments).mockResolvedValue({
      'f-fixed': { id: 'c1', findingId: 'f-fixed', taskId: null, authorId: lead.id, body: 'Fixed in build 42', createdAt: '2026-10-30T15:00:00Z' },
    })
  })

  it('hedi sees fixed finding under Needs you', async () => {
    signInAs(hedi)
    renderApp('/inbox')
    expect(await screen.findByRole('heading', { level: 1, name: 'Your turn' })).toBeInTheDocument()
    const needs = await screen.findByRole('region', { name: 'Needs you' })
    const link = await within(needs).findByRole('link', { name: /Login crash/ })
    expect(link).toHaveAttribute('href', '/findings/f-fixed')
    expect(link).toHaveTextContent('Fixed')
    expect(link).toHaveTextContent('Mobile App QA')
    expect(await within(needs).findByText(/Fixed in build 42/)).toBeInTheDocument()
    expect(within(needs).getByText(/No device/)).toBeInTheDocument()
    expect(within(needs).getByRole('heading', { name: 'Findings' })).toBeInTheDocument()
    expect(within(needs).getByRole('heading', { name: 'Tasks' })).toBeInTheDocument()
  })

  it('creator sees handed-out task under Waiting on others', async () => {
    signInAs(hedi)
    renderApp('/inbox')
    const waiting = await screen.findByRole('region', { name: 'Waiting on others' })
    expect(await within(waiting).findByRole('link', { name: /Handed out task/ })).toHaveAttribute('href', '/tasks/t-out')
    expect(within(waiting).queryByText('Login crash')).not.toBeInTheDocument()
  })

  it('marks unseen items with a NEW chip', async () => {
    vi.mocked(listUnseen).mockResolvedValue([{ type: 'finding', id: 'f-fixed' }])
    signInAs(hedi)
    renderApp('/inbox')
    const needs = await screen.findByRole('region', { name: 'Needs you' })
    expect(await within(needs).findByText('NEW')).toBeInTheDocument()
  })

  it('badge equals Needs you count', async () => {
    signInAs(hedi)
    renderApp('/inbox')
    const needs = await screen.findByRole('region', { name: 'Needs you' })
    await within(needs).findByRole('link', { name: /Login crash/ })
    const rows = within(needs).getAllByRole('link').length
    expect(rows).toBe(2)
    const nav = screen.getByRole('link', { name: /Your turn/ })
    expect(nav).toHaveAttribute('href', '/inbox')
    expect(await within(nav).findByText(String(rows))).toBeInTheDocument()
  })

  it('has friendly empty states', async () => {
    vi.mocked(listFindings).mockResolvedValue([])
    vi.mocked(listTasks).mockResolvedValue([])
    signInAs(khaushik)
    renderApp('/inbox')
    expect(await screen.findByText('Nothing needs you right now.')).toBeInTheDocument()
    expect(screen.getByText('Nothing waiting on others.')).toBeInTheDocument()
  })
})
