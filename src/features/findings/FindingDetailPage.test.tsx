import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addComment, listComments } from '../../data/comments'
import { deleteFinding, getFinding, listFindings, requestChangesFinding, setFindingStatus } from '../../data/findings'
import { getMyProfile, listProfiles } from '../../data/profiles'
import { getProject } from '../../data/projects'
import { listTasks } from '../../data/tasks'
import type { FindingDetail, Profile } from '../../data/types'
import { hedi, khaushik, lead, makeFinding } from '../../test/factories'
import { auth } from '../../test/mockAuth'
import { renderApp } from '../../test/renderApp'

vi.mock('../../data/auth', () => import('../../test/mockAuth').then((m) => m.authModule))
vi.mock('../../data/profiles', () => import('../../test/mockData').then((m) => m.profilesModule))
vi.mock('../../data/projects', () => import('../../test/mockData').then((m) => m.projectsModule))
vi.mock('../../data/tasks', () => import('../../test/mockData').then((m) => m.tasksModule))
vi.mock('../../data/findings', () => import('../../test/mockData').then((m) => m.findingsModule))
vi.mock('../../data/images', () => import('../../test/mockData').then((m) => m.imagesModule))
vi.mock('../../data/comments', () => import('../../test/mockData').then((m) => m.commentsModule))

function detail(overrides: Partial<FindingDetail> = {}): FindingDetail {
  return {
    ...makeFinding({ id: 'f1', projectId: 'p1', title: 'Login crash', authorId: khaushik.id }),
    images: [{ id: 'i1', findingId: 'f1', storagePath: 'findings/f1/a.webp', position: 0, url: 'http://img/a' }],
    ...overrides,
  }
}

function signInAs(profile: Profile) {
  auth.signedInAs(profile.id)
  vi.mocked(getMyProfile).mockResolvedValue(profile)
}

describe('FindingDetailPage', () => {
  beforeEach(() => {
    signInAs(hedi)
    vi.mocked(listProfiles).mockResolvedValue([hedi, khaushik, lead])
    vi.mocked(getProject).mockResolvedValue({
      id: 'p1',
      name: 'Mobile App QA',
      description: null,
      createdBy: lead.id,
      createdAt: '',
    })
    vi.mocked(listTasks).mockResolvedValue([])
    vi.mocked(listFindings).mockResolvedValue([])
    vi.mocked(getFinding).mockResolvedValue(detail({ explanation: 'line1\nline2' }))
    vi.mocked(listComments).mockResolvedValue([])
  })

  it('keeps line breaks in the explanation', async () => {
    renderApp('/findings/f1')
    const text = await screen.findByText(/line1/)
    expect(text).toHaveClass('whitespace-pre-wrap')
    expect(text.textContent).toBe('line1\nline2')
  })

  it('shows HTML in an explanation as plain text, never as markup', async () => {
    vi.mocked(getFinding).mockResolvedValue(detail({ explanation: '<b>x</b>' }))
    renderApp('/findings/f1')
    expect(await screen.findByText('<b>x</b>')).toBeInTheDocument()
    expect(document.querySelector('b')).toBeNull()
  })

  it('gives a teammate no status buttons, no edit/delete and no reply box', async () => {
    renderApp('/findings/f1')
    await screen.findByRole('heading', { name: 'Login crash' })
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Resubmit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Add a comment')).not.toBeInTheDocument()
  })

  it('lets the lead approve and close', async () => {
    signInAs(lead)
    vi.mocked(setFindingStatus).mockResolvedValue(detail({ status: 'approved' }))
    renderApp('/findings/f1')
    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }))
    expect(setFindingStatus).toHaveBeenCalledWith('f1', 'approved')
  })

  it('makes the lead write a comment to send it back', async () => {
    signInAs(lead)
    vi.mocked(requestChangesFinding).mockResolvedValue()
    renderApp('/findings/f1')
    await userEvent.click(await screen.findByRole('button', { name: 'Request changes' }))

    const dialog = screen.getByRole('dialog')
    const send = within(dialog).getByRole('button', { name: 'Request changes' })
    expect(send).toBeDisabled()
    await userEvent.type(within(dialog).getByLabelText('What needs fixing?'), '   ')
    expect(send).toBeDisabled()
    await userEvent.type(within(dialog).getByLabelText('What needs fixing?'), 'Need the error log')
    await userEvent.click(send)
    expect(requestChangesFinding).toHaveBeenCalledWith('f1', '   Need the error log')
  })

  it('lets the author mark a sent-back finding fixed, but not approve it', async () => {
    signInAs(khaushik)
    vi.mocked(getFinding).mockResolvedValue(detail({ status: 'changes_requested' }))
    vi.mocked(setFindingStatus).mockResolvedValue(detail({ status: 'resubmitted' }))
    renderApp('/findings/f1')
    await userEvent.click(await screen.findByRole('button', { name: 'Resubmit' }))
    expect(setFindingStatus).toHaveBeenCalledWith('f1', 'resubmitted')
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
  })

  it('shows the comment thread and lets the author reply', async () => {
    signInAs(khaushik)
    vi.mocked(getFinding).mockResolvedValue(detail({ status: 'changes_requested' }))
    vi.mocked(listComments).mockResolvedValue([
      {
        id: 'c1',
        findingId: 'f1',
        taskId: null,
        authorId: lead.id,
        body: 'Need logs\n<i>asap</i>',
        createdAt: '2026-10-30T15:00:00Z',
      },
    ])
    vi.mocked(addComment).mockResolvedValue({
      id: 'c2',
      findingId: 'f1',
      taskId: null,
      authorId: khaushik.id,
      body: 'Added',
      createdAt: '2026-10-30T16:00:00Z',
    })
    renderApp('/findings/f1')

    const thread = await screen.findByRole('region', { name: 'Comments' })
    const body = await within(thread).findByText(/Need logs/)
    expect(body).toHaveClass('whitespace-pre-wrap')
    expect(body.textContent).toBe('Need logs\n<i>asap</i>')
    expect(within(thread).getByText('Lead')).toBeInTheDocument()

    await userEvent.type(within(thread).getByLabelText('Add a comment'), 'Added')
    await userEvent.click(within(thread).getByRole('button', { name: 'Add comment' }))
    expect(addComment).toHaveBeenCalledWith({ findingId: 'f1' }, 'Added')
  })

  it('freezes a closed finding for its author (no edit link)', async () => {
    signInAs(khaushik)
    vi.mocked(getFinding).mockResolvedValue(detail({ status: 'approved' }))
    renderApp('/findings/f1')
    await screen.findByRole('heading', { name: 'Login crash' })
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument()
  })

  it('lets the author delete after confirming, then returns to the project', async () => {
    signInAs(khaushik)
    vi.mocked(deleteFinding).mockResolvedValue()
    renderApp('/findings/f1')
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    expect(deleteFinding).not.toHaveBeenCalled()
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete finding' }))
    expect(deleteFinding).toHaveBeenCalledWith('f1')
    expect(await screen.findByRole('heading', { name: 'Mobile App QA' })).toBeInTheDocument()
  })
})
