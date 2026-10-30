import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { THEME_STORAGE_KEY } from '../lib/theme'
import { ThemeToggle } from './ThemeToggle'

describe('ThemeToggle', () => {
  afterEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  it('starts on System', () => {
    render(<ThemeToggle />)
    expect(screen.getByRole('button', { name: 'System theme' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('switches to dark and remembers it', async () => {
    render(<ThemeToggle />)
    await userEvent.click(screen.getByRole('button', { name: 'Dark theme' }))
    expect(document.documentElement).toHaveClass('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(screen.getByRole('button', { name: 'Dark theme' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('switches back to light', async () => {
    render(<ThemeToggle />)
    await userEvent.click(screen.getByRole('button', { name: 'Dark theme' }))
    await userEvent.click(screen.getByRole('button', { name: 'Light theme' }))
    expect(document.documentElement).not.toHaveClass('dark')
  })
})
