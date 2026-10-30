import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteFinding, getFinding, listFindings, setFindingStatus } from '../../data/findings'
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
    vi.mocked(getProject).mockResolvedValue({ id: 'p1', name: 'Mobile App QA', description: null, createdBy: lead.id, createdAt: '' })
    vi.mocked(listTasks).mockResolvedValue([])
    vi.mocked(listFindings).mockResolvedValue([])
    vi.mocked(getFinding).mockResolvedValue(detail({ explanation: 'line1\nline2' }))
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

  it('lets a member close someone else\'s finding but not edit or delete it', async () => {
    vi.mocked(setFindingStatus).mockResolvedValue(detail({ status: 'closed' }))
    renderApp('/findings/f1')
    await userEvent.click(await screen.findByRole('button', { name: 'Mark closed' }))
    expect(setFindingStatus).toHaveBeenCalledWith('f1', 'closed')
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })

  it('shows author name, project link and the screenshot gallery', async () => {
    renderApp('/findings/f1')
    expect(await screen.findByText('Khaushik')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Mobile App QA' })).toHaveAttribute('href', '/projects/p1')
    await userEvent.click(screen.getByRole('button', { name: 'Open screenshot 1' }))
    expect(within(screen.getByRole('dialog')).getByRole('img')).toHaveAttribute('src', 'http://img/a')
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
