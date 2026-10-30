import { createEvent, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ScreenshotInput } from './ScreenshotInput'

const png = (name = 'shot.png') => new File(['x'], name, { type: 'image/png' })
const text = () => new File(['hello'], 'notes.txt', { type: 'text/plain' })

/** Fires a paste on the page carrying files, like Ctrl+V after taking a screenshot. */
function pasteFiles(files: File[]) {
  const event = createEvent.paste(document)
  Object.defineProperty(event, 'clipboardData', { value: { files } })
  fireEvent(document, event)
}

describe('ScreenshotInput', () => {
  it('adds a screenshot pasted with Ctrl+V', () => {
    const onChange = vi.fn()
    render(<ScreenshotInput value={[]} onChange={onChange} />)
    const shot = png()
    pasteFiles([shot])
    expect(onChange).toHaveBeenCalledWith([shot])
  })

  it('ignores a paste with no files (normal text paste)', () => {
    const onChange = vi.fn()
    render(<ScreenshotInput value={[]} onChange={onChange} />)
    pasteFiles([])
    expect(onChange).not.toHaveBeenCalled()
  })

  it('rejects a dropped non-image with a visible message', () => {
    const onChange = vi.fn()
    render(<ScreenshotInput value={[]} onChange={onChange} />)
    fireEvent.drop(screen.getByTestId('screenshot-dropzone'), { dataTransfer: { files: [text()] } })
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Only images can be attached')
  })

  it('stops at 10 screenshots in total, counting ones already saved', () => {
    const onChange = vi.fn()
    render(<ScreenshotInput value={[]} onChange={onChange} existingCount={9} />)
    pasteFiles([png('a.png'), png('b.png')])
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ name: 'a.png' })])
    expect(screen.getByRole('alert')).toHaveTextContent('Max 10 screenshots per finding')
  })

  it('adds images chosen with the file picker', async () => {
    const onChange = vi.fn()
    render(<ScreenshotInput value={[]} onChange={onChange} />)
    const shot = png()
    await userEvent.upload(screen.getByLabelText('Add screenshots'), shot)
    expect(onChange).toHaveBeenCalledWith([shot])
  })

  it('removes a pending screenshot', async () => {
    const onChange = vi.fn()
    const [a, b] = [png('a.png'), png('b.png')]
    render(<ScreenshotInput value={[a, b]} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove screenshot 1' }))
    expect(onChange).toHaveBeenCalledWith([b])
  })
})
