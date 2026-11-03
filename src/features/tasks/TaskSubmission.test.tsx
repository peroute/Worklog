import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listChecklist } from '../../data/checklist'
import { listProfiles } from '../../data/profiles'
import type { ChecklistItem } from '../../data/types'
import { hedi, khaushik, lead, makeChecklistItem, makeTask } from '../../test/factories'
import { renderPage } from '../../test/renderPage'
import { TaskSubmission, type SubmissionMode } from './TaskSubmission'

vi.mock('../../data/auth', () => import('../../test/mockAuth').then((m) => m.authModule))
vi.mock('../../data/checklist', () => import('../../test/mockData').then((m) => m.checklistModule))
vi.mock('../../data/profiles', () => import('../../test/mockData').then((m) => m.profilesModule))
vi.mock('../../data/tasks', () => import('../../test/mockData').then((m) => m.tasksModule))
vi.mock('../../data/taskAttachments', () => import('../../test/mockData').then((m) => m.taskAttachmentsModule))
// Owned by another task (still importing the deleted permissions module); stubbed so this file runs alone.
vi.mock('./AttachmentList', () => ({ AttachmentList: () => null }))

const task = makeTask({ id: 't1', assignedTo: hedi.id, createdBy: lead.id, checklistTotal: 2, checklistDone: 1 })

function openForm(mode: SubmissionMode, items: ChecklistItem[]) {
  vi.mocked(listChecklist).mockResolvedValue(items)
  renderPage(<TaskSubmission task={task} me={hedi} attachments={[]} mode={mode} onModeChange={vi.fn()} />, { path: '/', route: '/' })
}

const halfDone = [
  makeChecklistItem({ taskId: 't1', title: 'Reproduce', done: true }),
  makeChecklistItem({ taskId: 't1', title: 'Test on Android 14' }),
]

describe('TaskSubmission checklist notice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listProfiles).mockResolvedValue([hedi, khaushik, lead])
  })

  it('lists unticked items before submitting', async () => {
    openForm('submit', halfDone)
    const notice = await screen.findByRole('status')
    expect(notice).toHaveTextContent("1 of 2 checklist items aren't ticked. You can still submit — say why in your note.")
    expect(notice).toHaveTextContent('Test on Android 14')
  })

  it('stays quiet when editing a submission', async () => {
    openForm('edit', halfDone)
    await vi.waitFor(() => expect(listChecklist).toHaveBeenCalled())
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('stays quiet when everything is ticked', async () => {
    openForm('submit', halfDone.map((i) => ({ ...i, done: true })))
    await vi.waitFor(() => expect(listChecklist).toHaveBeenCalled())
    expect(screen.queryByRole('status')).toBeNull()
  })
})
