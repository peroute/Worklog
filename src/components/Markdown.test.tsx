import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Markdown } from './Markdown'

describe('Markdown', () => {
  it('renders bold, lists and links', () => {
    render(<Markdown>{'**Heads up**\n\n- one\n- two\n\n[docs](https://example.com)'}</Markdown>)
    expect(screen.getByText('Heads up').tagName).toBe('STRONG')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    const link = screen.getByRole('link', { name: 'docs' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('keeps single line breaks as typed', () => {
    const { container } = render(<Markdown>{'line one\nline two'}</Markdown>)
    expect(container.querySelector('br')).not.toBeNull()
  })

  it('never renders raw HTML', () => {
    const { container } = render(<Markdown>{'<img src=x onerror="alert(1)"><script>alert(1)</script>'}</Markdown>)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('script')).toBeNull()
  })
})
