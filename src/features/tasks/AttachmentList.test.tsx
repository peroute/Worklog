import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listProfiles } from '../../data/profiles'
import { deleteTaskAttachment, downloadTaskAttachment } from '../../data/taskAttachments'
import { hedi, khaushik, lead, makeAttachment, makeTask } from '../../test/factories'
import { renderWithProviders } from '../../test/renderApp'
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

  it('offers Preview on PDF and .docx, not on old .doc', () => {
    const pdf = makeAttachment({ fileName: 'brief.pdf' })
    const docx = makeAttachment({
      fileName: 'notes.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
    const doc = makeAttachment({ fileName: 'old.doc', mimeType: 'application/msword' })
    renderWithProviders(<AttachmentList attachments={[pdf, docx, doc]} task={makeTask()} me={khaushik} />)

    expect(screen.getByRole('button', { name: 'Preview brief.pdf' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Preview notes.docx' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Preview old.doc' })).not.toBeInTheDocument()
  })

  it('previews a PDF in a dialog, forcing the PDF type', async () => {
    const pdf = makeAttachment({ fileName: 'brief.pdf' })
    // The stored bytes claim to be HTML; the preview must still treat them as a PDF.
    vi.mocked(downloadTaskAttachment).mockResolvedValue(new Blob(['%PDF'], { type: 'text/html' }))
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:preview')
    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = vi.fn()
    renderWithProviders(<AttachmentList attachments={[pdf]} task={makeTask()} me={khaushik} />)

    await userEvent.click(screen.getByRole('button', { name: 'Preview brief.pdf' }))
    const dialog = await screen.findByRole('dialog', { name: 'brief.pdf' })
    expect(await within(dialog).findByTitle('Preview of brief.pdf')).toHaveAttribute('src', 'blob:preview')
    expect(downloadTaskAttachment).toHaveBeenCalledWith(pdf.storagePath)
    expect(createObjectURL.mock.calls[0][0].type).toBe('application/pdf')

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview')
  })

  it('shows the error when the file cannot be loaded', async () => {
    vi.mocked(downloadTaskAttachment).mockRejectedValue(new Error('Could not load the file'))
    renderWithProviders(<AttachmentList attachments={[makeAttachment({ fileName: 'brief.pdf' })]} task={makeTask()} me={khaushik} />)

    await userEvent.click(screen.getByRole('button', { name: 'Preview brief.pdf' }))
    expect(await screen.findByText('Could not load the file')).toBeInTheDocument()
  })

  it('offers removal on image thumbnails too', () => {
    const image = makeAttachment({ fileName: 'crash.png', mimeType: 'image/png', uploadedBy: lead.id })
    renderWithProviders(<AttachmentList attachments={[image]} task={makeTask()} me={khaushik} />)
    expect(screen.getByRole('button', { name: 'Remove crash.png' })).toBeInTheDocument()
  })
})
