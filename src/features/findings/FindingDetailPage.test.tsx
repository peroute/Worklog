import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listActivity } from '../../data/activity'
import { listComments } from '../../data/comments'
import { deleteFinding, getFinding, listFindings, setFindingStatus } from '../../data/findings'
import { getMyProfile, listProfiles } from '../../data/profiles'
import { getProject, listProjects } from '../../data/projects'
import { listTasks } from '../../data/tasks'
import type { FindingDetail, Profile } from '../../data/types'
import { hedi, khaushik, lead, makeFinding } from '../../test/factories'
import { auth } from '../../test/mockAuth'
import { renderPage } from '../../test/renderPage'
import { FindingDetailPage } from './FindingDetailPage'

vi.mock('../../data/auth', () => import('../../test/mockAuth').then((m) => m.authModule))
vi.mock('../../data/profiles', () => import('../../test/mockData').then((m) => m.profilesModule))
vi.mock('../../data/projects', () => import('../../test/mockData').then((m) => m.projectsModule))
vi.mock('../../data/tasks', () => import('../../test/mockData').then((m) => m.tasksModule))
vi.mock('../../data/findings', () => import('../../test/mockData').then((m) => m.findingsModule))
vi.mock('../../data/images', () => import('../../test/mockData').then((m) => m.imagesModule))
vi.mock('../../data/comments', () => import('../../test/mockData').then((m) => m.commentsModule))
vi.mock('../../data/activity', () => import('../../test/mockData').then((m) => m.activityModule))
vi.mock('../../data/reads', () => import('../../test/mockData').then((m) => m.readsModule))

const project = { id: 'p1', name: 'Mobile App QA', description: null, createdBy: lead.id, createdAt: '', deletedAt: null, deletedBy: null }

/** hedi reported it, so with no task attached the project creator (lead) is who must act on an open one. */
function detail(overrides: Partial<FindingDetail> = {}): FindingDetail {
  return {
    ...makeFinding({ id: 'f1', projectId: 'p1', title: 'Login crash', authorId: hedi.id }),
    images: [
      { id: 'i1', findingId: 'f1', storagePath: 'findings/f1/a.webp', position: 0, url: 'http://img/a', deletedAt: null, deletedBy: null },
    ],
    ...overrides,
  }
}

function signInAs(profile: Profile) {
  auth.signedInAs(profile.id)
  vi.mocked(getMyProfile).mockResolvedValue(profile)
}

function mount() {
  return renderPage(<FindingDetailPage />, {
    path: '/findings/f1',
    route: '/findings/:id',
    others: { '/projects/:id': <h1>Project page</h1> },
  })
}

describe('FindingDetailPage', () => {
  beforeEach(() => {
    signInAs(hedi)
    vi.mocked(listProfiles).mockResolvedValue([hedi, khaushik, lead])
    vi.mocked(getProject).mockResolvedValue(project)
    vi.mocked(listProjects).mockResolvedValue([{ ...project, openFindings: 0, openTasks: 0 }])
    vi.mocked(listTasks).mockResolvedValue([])
    vi.mocked(listFindings).mockResolvedValue([])
    vi.mocked(getFinding).mockReset()
    vi.mocked(getFinding).mockResolvedValue(detail({ explanation: 'line1\nline2' }))
    vi.mocked(setFindingStatus).mockReset()
    vi.mocked(deleteFinding).mockReset()
    vi.mocked(listComments).mockResolvedValue([])
    vi.mocked(listActivity).mockResolvedValue([])
  })

  it('keeps line breaks in the explanation', async () => {
    mount()
    const text = await screen.findByText(/line1/)
    expect(text.querySelector('br')).not.toBeNull()
    expect(text.textContent).toMatch(/line1\s*line2/)
  })

  it('shows HTML in an explanation as plain text, never as markup', async () => {
    vi.mocked(getFinding).mockResolvedValue(detail({ explanation: '<b>x</b>' }))
    mount()
    expect(await screen.findByText('<b>x</b>')).toBeInTheDocument()
    expect(document.querySelector('b')).toBeNull()
  })

  it('shows the status badge from the shared labels', async () => {
    vi.mocked(getFinding).mockResolvedValue(detail({ status: 'fixed', fixedBy: khaushik.id }))
    mount()
    expect(await screen.findByText('Fixed, please re-check')).toBeInTheDocument()
  })

  it('reporter sees Verified on fixed finding', async () => {
    vi.mocked(getFinding).mockResolvedValue(detail({ status: 'fixed', fixedBy: khaushik.id }))
    vi.mocked(setFindingStatus).mockResolvedValue()
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Verified' }))
    expect(setFindingStatus).toHaveBeenCalledWith('f1', 'verified', undefined)
  })

  it('fixer does not see Verified', async () => {
    signInAs(khaushik)
    vi.mocked(getFinding).mockResolvedValue(detail({ status: 'fixed', fixedBy: khaushik.id }))
    mount()
    await screen.findByRole('heading', { name: 'Login crash' })
    await userEvent.click(await screen.findByRole('button', { name: 'More' }))
    expect(screen.getByRole('menuitem', { name: 'Still broken' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Verified' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Verified' })).not.toBeInTheDocument()
  })

  it("puts the actions under More when it isn't their turn", async () => {
    signInAs(khaushik) // lead's turn on an open finding in lead's project
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'More' }))
    expect(screen.getByRole('menuitem', { name: 'Mark fixed' })).toBeInTheDocument()
  })

  it('shows the action buttons straight away when it is their turn', async () => {
    signInAs(lead)
    mount()
    expect(await screen.findByRole('button', { name: 'Mark fixed' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'More' })).not.toBeInTheDocument()
  })

  it('sends the comment along with a comment-required action', async () => {
    signInAs(lead)
    vi.mocked(setFindingStatus).mockResolvedValue()
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Need more info' }))
    await userEvent.type(screen.getByLabelText('Comment'), 'Which browser?')
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Need more info' }))
    expect(setFindingStatus).toHaveBeenCalledWith('f1', 'needs_info', 'Which browser?')
  })

  it('shows error and refetches on refused action', async () => {
    vi.mocked(getFinding).mockResolvedValue(detail({ status: 'fixed', fixedBy: khaushik.id }))
    vi.mocked(setFindingStatus).mockRejectedValue(new Error('Someone already changed this'))
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Verified' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Someone already changed this')
    await vi.waitFor(() => expect(getFinding).toHaveBeenCalledTimes(2))
  })

  it('shows Edit and Delete to everyone', async () => {
    signInAs(khaushik)
    mount()
    expect(await screen.findByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/findings/f1/edit')
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('moves to Trash after confirming, then returns to the project', async () => {
    signInAs(khaushik)
    vi.mocked(deleteFinding).mockResolvedValue()
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    expect(deleteFinding).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog', { name: 'Move to Trash?' })
    expect(dialog).toHaveTextContent('restore it from Trash')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Move to Trash' }))
    expect(deleteFinding).toHaveBeenCalledWith('f1')
    expect(await screen.findByRole('heading', { name: 'Project page' })).toBeInTheDocument()
  })

  it('shows the timeline with a comment box', async () => {
    mount()
    expect(await screen.findByRole('region', { name: 'Timeline' })).toBeInTheDocument()
    expect(await screen.findByRole('textbox', { name: 'Add a comment' })).toBeInTheDocument()
  })
})
