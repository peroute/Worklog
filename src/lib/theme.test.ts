import { afterEach, describe, expect, it } from 'vitest'
import { applyTheme, readThemePref, resolveTheme, saveThemePref, THEME_STORAGE_KEY } from './theme'

describe('theme', () => {
  afterEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  it('follows the system setting by default', () => {
    expect(readThemePref()).toBe('system')
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })

  it('lets an explicit choice override the system', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('remembers the choice per browser', () => {
    saveThemePref('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(readThemePref()).toBe('dark')
  })

  it('ignores a corrupted stored value', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'purple')
    expect(readThemePref()).toBe('system')
  })

  it('puts the dark class on <html> only in dark mode', () => {
    applyTheme('dark', false)
    expect(document.documentElement).toHaveClass('dark')
    applyTheme('light', true)
    expect(document.documentElement).not.toHaveClass('dark')
  })
})
