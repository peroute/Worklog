import { createEvent, fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFinding, getFinding, updateFinding } from '../../data/findings'
import { deleteFindingImage, uploadFindingImages } from '../../data/images'
import { getMyProfile, listProfiles } from '../../data/profiles'
import { getProject, listProjects } from '../../data/projects'
import { listTasks } from '../../data/tasks'
import type { ProjectSummary } from '../../data/types'
import { hedi, khaushik, lead, makeFinding, makeTask } from '../../test/factories'
import { auth } from '../../test/mockAuth'
import { renderPage } from '../../test/renderPage'
import { FindingDetailPage } from './FindingDetailPage'
import { FindingFormPage } from './FindingForm'
import { compressScreenshot } from './compress'

vi.mock('../../data/auth', () => import('../../test/mockAuth').then((m) => m.authModule))
vi.mock('../../data/profiles', () => import('../../test/mockData').then((m) => m.profilesModule))
vi.mock('../../data/projects', () => import('../../test/mockData').then((m) => m.projectsModule))
vi.mock('../../data/tasks', () => import('../../test/mockData').then((m) => m.tasksModule))
vi.mock('../../data/findings', () => import('../../test/mockData').then((m) => m.findingsModule))
vi.mock('../../data/images', () => import('../../test/mockData').then((m) => m.imagesModule))
vi.mock('./compress', () => ({ compressScreenshot: vi.fn(async (file: File) => file) }))
vi.mock('../../lib/dates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/dates')>()),
  todayInTeamTz: () => '2026-10-29',
}))

vi.mock('../../data/comments', () => import('../../test/mockData').then((m) => m.commentsModule))
vi.mock('../../data/activity', () => import('../../test/mockData').then((m) => m.activityModule))
vi.mock('../../data/reads', () => import('../../test/mockData').then((m) => m.readsModule))

const summary = (id: string, name: string): ProjectSummary => ({
  id,
  name,
  description: null,
  createdBy: lead.id,
  createdAt: '',
  deletedAt: null,
  deletedBy: null,
  openFindings: 0,
  openTasks: 0,
})

/** Mounts the form at `path` (new or edit), with the finding page it navigates to after saving. */
function renderApp(path: string) {
  const editing = path.includes('/edit')
  return renderPage(<FindingFormPage />, {
    path,
    route: editing ? '/findings/:id/edit' : '/findings/new',
    others: { '/findings/:id': <FindingDetailPage />, '/projects/:id': <h1>Project page</h1> },
  })
}

describe('FindingForm (new finding)', () => {
  beforeEach(() => {
    auth.signedInAs(hedi.id)
    vi.mocked(getMyProfile).mockResolvedValue(hedi)
    vi.mocked(listProfiles).mockResolvedValue([hedi, khaushik, lead])
    vi.mocked(listProjects).mockResolvedValue([summary('p1', 'Mobile App QA'), summary('p2', 'Vendor Research')])
    vi.mocked(listTasks).mockImplementation(async (filter) =>
      filter?.projectId === 'p1' ? [makeTask({ id: 't1', title: 'Retest login', projectId: 'p1' })] : [],
    )
  })

  it('requires a title and does not save without one', async () => {
    renderApp('/findings/new?projectId=p1')
    await userEvent.type(await screen.findByLabelText('Explanation'), 'Crashes on start')
    await userEvent.click(screen.getByRole('button', { name: 'Save finding' }))
    expect(await screen.findByText('Title is required')).toBeInTheDocument()
    expect(createFinding).not.toHaveBeenCalled()
  })

  it('defaults the date to today in Central time', async () => {
    renderApp('/findings/new?projectId=p1')
    expect(await screen.findByLabelText('Date')).toHaveValue('2026-10-29')
  })

  it('marks tasks that have not started yet in the linked-task list', async () => {
    vi.mocked(listTasks).mockResolvedValue([
      makeTask({ id: 't9', title: 'Scheduled check', projectId: 'p1', startDate: '2026-11-03' }),
    ])
    renderApp('/findings/new?projectId=p1')
    expect(await screen.findByRole('option', { name: 'Scheduled check (starts Tue, Nov 3)' })).toBeInTheDocument()
  })

  it('clears the linked task when the project changes', async () => {
    renderApp('/findings/new?projectId=p1')
    const taskSelect = await screen.findByLabelText('Linked task')
    await screen.findByRole('option', { name: 'Retest login' })
    await userEvent.selectOptions(taskSelect, 't1')
    expect(taskSelect).toHaveValue('t1')

    await userEvent.selectOptions(screen.getByLabelText('Project'), 'p2')
    expect(screen.getByLabelText('Linked task')).toHaveValue('')
  })

  it('compresses screenshots, saves, and warns on the detail page when an upload failed', async () => {
    const saved = makeFinding({ id: 'f1', projectId: 'p1', title: 'Login crash', authorId: hedi.id })
    vi.mocked(createFinding).mockResolvedValue({ finding: saved, failedUploads: 1 })
    vi.mocked(getFinding).mockResolvedValue({ ...saved, images: [] })
    vi.mocked(getProject).mockResolvedValue(summary('p1', 'Mobile App QA'))
    renderApp('/findings/new?projectId=p1')

    await userEvent.type(await screen.findByLabelText('Title'), 'Login crash')
    await userEvent.type(screen.getByLabelText('Explanation'), 'Line 1{enter}Line 2')
    const shot = new File(['x'], 'shot.png', { type: 'image/png' })
    const paste = createEvent.paste(document)
    Object.defineProperty(paste, 'clipboardData', { value: { files: [shot] } })
    fireEvent(document, paste)
    await userEvent.click(screen.getByRole('button', { name: 'Save finding' }))

    expect(compressScreenshot).toHaveBeenCalledWith(shot)
    expect(createFinding).toHaveBeenCalledWith(
      { projectId: 'p1', taskId: null, title: 'Login crash', explanation: 'Line 1\nLine 2', findingDate: '2026-10-29' },
      [shot],
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '1 screenshot(s) failed to upload — edit the finding to retry.',
    )
    expect(screen.getByRole('heading', { name: 'Login crash' })).toBeInTheDocument()
  })
})

describe('FindingForm (edit)', () => {
  const image = { id: 'i1', findingId: 'f1', storagePath: 'findings/f1/a.webp', position: 3, url: 'http://img/a', deletedAt: null, deletedBy: null }
  const existing = { ...makeFinding({ id: 'f1', projectId: 'p1', title: 'Old title', authorId: hedi.id }), images: [image] }

  beforeEach(() => {
    vi.mocked(listProfiles).mockResolvedValue([hedi, khaushik, lead])
    vi.mocked(listProjects).mockResolvedValue([summary('p1', 'Mobile App QA')])
    vi.mocked(listTasks).mockResolvedValue([])
    vi.mocked(getProject).mockResolvedValue(summary('p1', 'Mobile App QA'))
    vi.mocked(getFinding).mockResolvedValue(existing)
  })

  it('saves text changes and removes a saved screenshot only on save', async () => {
    auth.signedInAs(hedi.id)
    vi.mocked(getMyProfile).mockResolvedValue(hedi)
    vi.mocked(updateFinding).mockResolvedValue(existing)
    vi.mocked(deleteFindingImage).mockResolvedValue()
    vi.mocked(uploadFindingImages).mockResolvedValue({ uploaded: [], failed: 0 })
    renderApp('/findings/f1/edit')

    const title = await screen.findByLabelText('Title')
    await userEvent.clear(title)
    await userEvent.type(title, 'New title')
    await userEvent.click(screen.getByRole('button', { name: 'Remove saved screenshot 1' }))
    expect(deleteFindingImage).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Save finding' }))
    expect(updateFinding).toHaveBeenCalledWith('f1', expect.objectContaining({ title: 'New title' }))
    expect(deleteFindingImage).toHaveBeenCalledWith(image)
    // New screenshots continue after the highest existing position.
    expect(uploadFindingImages).toHaveBeenCalledWith('f1', [], 4)
  })

  it("opens the editor for someone else's finding", async () => {
    auth.signedInAs(khaushik.id)
    vi.mocked(getMyProfile).mockResolvedValue(khaushik)
    renderApp('/findings/f1/edit')
    expect(await screen.findByLabelText('Title')).toHaveValue('Old title')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
