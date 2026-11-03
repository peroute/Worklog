import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listActivity } from '../../data/activity'
import { addComment, listComments } from '../../data/comments'
import { getMyProfile, listProfiles } from '../../data/profiles'
import { getLastSeen, markSeen } from '../../data/reads'
import type { ActivityEntry, Comment, Profile } from '../../data/types'
import { hedi, khaushik, lead } from '../../test/factories'
import { auth } from '../../test/mockAuth'
import { renderPage } from '../../test/renderPage'
import { Timeline } from './Timeline'

vi.mock('../../data/auth', () => import('../../test/mockAuth').then((m) => m.authModule))
vi.mock('../../data/profiles', () => import('../../test/mockData').then((m) => m.profilesModule))
vi.mock('../../data/comments', () => import('../../test/mockData').then((m) => m.commentsModule))
vi.mock('../../data/activity', () => import('../../test/mockData').then((m) => m.activityModule))
vi.mock('../../data/reads', () => import('../../test/mockData').then((m) => m.readsModule))

const target = { findingId: 'f1' }

const comment = (id: string, authorId: string, body: string, createdAt: string): Comment => ({
  id,
  findingId: 'f1',
  taskId: null,
  authorId,
  body,
  createdAt,
})
const activity = (
  id: string,
  actorId: string | null,
  action: ActivityEntry['action'],
  details: Record<string, unknown>,
  createdAt: string,
): ActivityEntry => ({ id, actorId, action, details, createdAt })

function signInAs(profile: Profile) {
  auth.signedInAs(profile.id)
  vi.mocked(getMyProfile).mockResolvedValue(profile)
}

function mount() {
  return renderPage(<Timeline target={target} />, { path: '/x', route: '/x' })
}

describe('Timeline', () => {
  beforeEach(() => {
    signInAs(hedi)
    vi.mocked(listProfiles).mockResolvedValue([hedi, khaushik, lead])
    vi.mocked(listComments).mockResolvedValue([])
    vi.mocked(listActivity).mockResolvedValue([])
    vi.mocked(getLastSeen).mockReset()
    vi.mocked(getLastSeen).mockResolvedValue(null)
    vi.mocked(markSeen).mockReset()
    vi.mocked(markSeen).mockResolvedValue(undefined)
  })

  it('renders comments and history in order', async () => {
    vi.mocked(listComments).mockResolvedValue([comment('c1', lead.id, 'Which Safari version?', '2026-11-01T16:00:00Z')])
    vi.mocked(listActivity).mockResolvedValue([
      activity('a1', hedi.id, 'created', {}, '2026-11-01T15:00:00Z'),
      activity('a2', lead.id, 'status_changed', { to: 'needs_info' }, '2026-11-01T16:00:00Z'),
    ])
    mount()

    const items = await screen.findAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('Hedi created this')
    expect(items[1]).toHaveTextContent('Lead')
    expect(items[1]).toHaveTextContent('Which Safari version?')
    expect(items[2]).toHaveTextContent('Lead marked Need more info')
  })

  it("shows NEW on others' newer entries", async () => {
    vi.mocked(getLastSeen).mockResolvedValue('2026-11-01T17:00:00Z')
    vi.mocked(listComments).mockResolvedValue([
      comment('c1', lead.id, 'Old one', '2026-11-01T16:00:00Z'),
      comment('c2', lead.id, 'Fresh one', '2026-11-02T16:00:00Z'),
      comment('c3', hedi.id, 'My own', '2026-11-02T17:00:00Z'),
    ])
    mount()

    const fresh = (await screen.findByText('Fresh one')).closest('li') as HTMLElement
    expect(within(fresh).getByText('NEW')).toBeInTheDocument()
    expect(within(screen.getByText('Old one').closest('li') as HTMLElement).queryByText('NEW')).toBeNull()
    expect(within(screen.getByText('My own').closest('li') as HTMLElement).queryByText('NEW')).toBeNull()
  })

  it('anyone can comment', async () => {
    signInAs(khaushik)
    vi.mocked(addComment).mockResolvedValue(comment('c9', khaushik.id, 'Me too', '2026-11-02T18:00:00Z'))
    mount()

    await userEvent.type(await screen.findByRole('textbox', { name: 'Add a comment' }), 'Me too')
    await userEvent.click(screen.getByRole('button', { name: 'Add comment' }))
    expect(addComment).toHaveBeenCalledWith(target, 'Me too')
  })

  it('has no comment box on a deleted item', async () => {
    renderPage(<Timeline target={target} deleted />, { path: '/x', route: '/x' })
    await screen.findByRole('region', { name: 'Timeline' })
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('marks seen after load, once', async () => {
    vi.mocked(listComments).mockResolvedValue([comment('c1', lead.id, 'Hello', '2026-11-01T16:00:00Z')])
    const view = mount()
    await screen.findByText('Hello')
    await vi.waitFor(() => expect(markSeen).toHaveBeenCalledWith({ type: 'finding', id: 'f1' }))
    expect(markSeen).toHaveBeenCalledTimes(1)

    // New data arriving later (a refetch) must not stamp it again.
    vi.mocked(listComments).mockResolvedValue([
      comment('c1', lead.id, 'Hello', '2026-11-01T16:00:00Z'),
      comment('c2', lead.id, 'Second', '2026-11-01T17:00:00Z'),
    ])
    await view.queryClient.invalidateQueries({ queryKey: ['comments'] })
    await screen.findByText('Second')
    expect(markSeen).toHaveBeenCalledTimes(1)
  })

  it('keeps showing NEW after it marked the item seen', async () => {
    // lastSeen was read before markSeen; a later refetch must not wipe the NEW chips mid-visit.
    vi.mocked(getLastSeen).mockResolvedValueOnce('2026-11-01T00:00:00Z').mockResolvedValue('2099-01-01T00:00:00Z')
    vi.mocked(listComments).mockResolvedValue([comment('c1', lead.id, 'Hello', '2026-11-01T16:00:00Z')])
    mount()
    await screen.findByText('Hello')
    await vi.waitFor(() => expect(markSeen).toHaveBeenCalled())
    expect(screen.getByText('NEW')).toBeInTheDocument()
  })

  it('shows an error when the history fails to load', async () => {
    vi.mocked(listActivity).mockRejectedValue(new Error('boom'))
    mount()
    expect(await screen.findByRole('alert')).toHaveTextContent('boom')
  })
})
