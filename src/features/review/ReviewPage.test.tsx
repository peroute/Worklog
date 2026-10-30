import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listLatestComments } from '../../data/comments'
import { listFindings } from '../../data/findings'
import { getMyProfile, listProfiles } from '../../data/profiles'
import { listProjects } from '../../data/projects'
import { listTasks } from '../../data/tasks'
import type { Profile } from '../../data/types'
import { hedi, khaushik, lead, makeFinding, makeTask } from '../../test/factories'
import { auth } from '../../test/mockAuth'
import { renderApp } from '../../test/renderApp'

vi.mock('../../data/auth', () => import('../../test/mockAuth').then((m) => m.authModule))
vi.mock('../../data/profiles', () => import('../../test/mockData').then((m) => m.profilesModule))
vi.mock('../../data/projects', () => import('../../test/mockData').then((m) => m.projectsModule))
vi.mock('../../data/tasks', () => import('../../test/mockData').then((m) => m.tasksModule))
vi.mock('../../data/findings', () => import('../../test/mockData').then((m) => m.findingsModule))
vi.mock('../../data/comments', () => import('../../test/mockData').then((m) => m.commentsModule))

function signInAs(profile: Profile) {
  auth.signedInAs(profile.id)
  vi.mocked(getMyProfile).mockResolvedValue(profile)
}

describe('ReviewPage', () => {
  beforeEach(() => {
    vi.mocked(listProfiles).mockResolvedValue([hedi, khaushik, lead])
    vi.mocked(listProjects).mockResolvedValue([
      { id: 'project-1', name: 'Mobile App QA', description: null, createdBy: lead.id, createdAt: '', openFindings: 0, openTasks: 0 },
    ])
    vi.mocked(listFindings).mockResolvedValue([
      makeFinding({ id: 'f-open', title: 'Hedi open finding', authorId: hedi.id, status: 'open' }),
      makeFinding({ id: 'f-review', title: 'Hedi sent back', authorId: hedi.id, status: 'needs_review' }),
      makeFinding({ id: 'f-lead', title: 'Lead own finding', authorId: lead.id, status: 'open' }),
    ])
    vi.mocked(listTasks).mockResolvedValue([
      makeTask({ id: 't-fixed', title: 'Khaushik fixed task', assignedTo: khaushik.id, status: 'fixed' }),
      makeTask({ id: 't-done', title: 'Hedi done task', assignedTo: hedi.id, status: 'done' }),
    ])
    vi.mocked(listLatestComments).mockResolvedValue({
      'f-review': { id: 'c1', findingId: 'f-review', taskId: null, authorId: lead.id, body: 'Add the error log', createdAt: '2026-10-30T15:00:00Z' },
    })
  })

  it("shows the lead what's waiting for them, without their own work", async () => {
    signInAs(lead)
    renderApp('/review')
    const waiting = await screen.findByRole('region', { name: 'Waiting for you' })
    expect(await within(waiting).findByRole('link', { name: /Hedi open finding/ })).toHaveAttribute('href', '/findings/f-open')
    expect(within(waiting).getByRole('link', { name: /Khaushik fixed task/ })).toHaveAttribute('href', '/tasks/t-fixed')
    expect(within(waiting).getByRole('link', { name: /Hedi done task/ })).toBeInTheDocument()
    expect(within(waiting).queryByText('Lead own finding')).not.toBeInTheDocument()
    expect(within(waiting).queryByText('Hedi sent back')).not.toBeInTheDocument()
  })

  it('shows a member what they must fix, with the lead\'s latest comment', async () => {
    signInAs(hedi)
    renderApp('/review')
    const toFix = await screen.findByRole('region', { name: 'Needs your fix' })
    const item = await within(toFix).findByRole('link', { name: /Hedi sent back/ })
    expect(item).toHaveTextContent('Add the error log')

    const waiting = screen.getByRole('region', { name: 'Waiting for the lead' })
    expect(within(waiting).getByText('Hedi open finding')).toBeInTheDocument()
    expect(within(waiting).getByText('Hedi done task')).toBeInTheDocument()
  })

  it('has friendly empty states', async () => {
    vi.mocked(listFindings).mockResolvedValue([])
    vi.mocked(listTasks).mockResolvedValue([])
    signInAs(khaushik)
    renderApp('/review')
    expect(await screen.findByText('Nothing to fix. 🎉')).toBeInTheDocument()
  })

  it('shows the count in the nav', async () => {
    signInAs(lead)
    renderApp('/')
    const link = await screen.findByRole('link', { name: /Review/ })
    expect(link).toHaveAttribute('href', '/review')
    expect(await within(link).findByText('3')).toBeInTheDocument()
  })
})
