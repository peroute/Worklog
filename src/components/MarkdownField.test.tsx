import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { MarkdownField } from './MarkdownField'

/** Holds the value in state like a real form does, so typing and toggling behave as in the app. */
function Harness({ initial = '', error }: { initial?: string; error?: string }) {
  const [value, setValue] = useState(initial)
  return <MarkdownField label="Explanation" value={value} onChange={setValue} error={error} />
}

describe('MarkdownField', () => {
  it('starts in write mode with a labelled textarea', () => {
    render(<Harness />)
    expect(screen.getByLabelText('Explanation').tagName).toBe('TEXTAREA')
    expect(screen.getByRole('button', { name: 'Write' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('previews the typed Markdown as rendered HTML', async () => {
    render(<Harness />)
    await userEvent.type(screen.getByLabelText('Explanation'), '**Heads up**')
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }))

    const preview = screen.getByRole('region', { name: 'Explanation preview' })
    expect(preview.querySelector('strong')).toHaveTextContent('Heads up')
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('keeps the text when switching back to write', async () => {
    render(<Harness initial="- one" />)
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }))
    await userEvent.click(screen.getByRole('button', { name: 'Write' }))
    expect(screen.getByLabelText('Explanation')).toHaveValue('- one')
  })

  it('shows a placeholder when there is nothing to preview', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect(screen.getByText('Nothing to preview yet.')).toBeInTheDocument()
  })

  it('links the error message to the textarea', () => {
    render(<Harness error="Explanation is required" />)
    const textarea = screen.getByLabelText('Explanation')
    expect(textarea).toHaveAttribute('aria-invalid', 'true')
    expect(textarea).toHaveAccessibleDescription(expect.stringContaining('Explanation is required'))
  })
})
