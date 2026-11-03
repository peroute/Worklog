import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listProfiles } from '../../data/profiles'
import { deleteTaskAttachment } from '../../data/taskAttachments'
import { hedi, khaushik, lead, makeAttachment, makeTask } from '../../test/factories'
import { renderWithProviders } from '../../test/renderPage'
import { AttachmentList } from './AttachmentList'

vi.mock('../../data/profiles', () => import('../../test/mockData').then((m) => m.profilesModule))
vi.mock('../../data/taskAttachments', () => import('../../test/mockData').then((m) => m.taskAttachmentsModule))

describe('AttachmentList', () => {
  beforeEach(() => {
    vi.mocked(listProfiles).mockResolvedValue([hedi, khaushik, lead])
  })

  it('lets anyone remove any file, asking first', async () => {
    // Uploaded by the lead, on a task assigned to Hedi: Khaushik is neither, and may still remove it.
    const file = makeAttachment({ fileName: 'brief.pdf', uploadedBy: lead.id })
    const proof = makeAttachment({ fileName: 'proof.pdf', uploadedBy: hedi.id, kind: 'proof' })
    vi.mocked(deleteTaskAttachment).mockResolvedValue()
    renderWithProviders(<AttachmentList attachments={[file, proof]} task={makeTask()} me={khaushik} />)

    expect(screen.getByRole('button', { name: 'Remove proof.pdf' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Remove brief.pdf' }))
    const dialog = await screen.findByRole('dialog')
    expect(deleteTaskAttachment).not.toHaveBeenCalled()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
    expect(deleteTaskAttachment).toHaveBeenCalledWith(file)
  })

  it('offers removal on image thumbnails too', () => {
    const image = makeAttachment({ fileName: 'crash.png', mimeType: 'image/png', uploadedBy: lead.id })
    renderWithProviders(<AttachmentList attachments={[image]} task={makeTask()} me={khaushik} />)
    expect(screen.getByRole('button', { name: 'Remove crash.png' })).toBeInTheDocument()
  })
})
