// Light / dark / follow-the-system theme. The choice is remembered per browser.
// index.html runs the same logic inline before React loads, so there's no white flash in dark mode.

export type ThemePref = 'system' | 'light' | 'dark'
export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'worklog-theme'
const PREFS: ThemePref[] = ['system', 'light', 'dark']

export function readThemePref(): ThemePref {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return PREFS.includes(stored as ThemePref) ? (stored as ThemePref) : 'system'
  } catch {
    return 'system' // storage blocked (e.g. strict privacy mode): just follow the system
  }
}

export function saveThemePref(pref: ThemePref): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref)
  } catch {
    // Storage blocked: the choice still applies for this visit.
  }
}

export function resolveTheme(pref: ThemePref, systemPrefersDark: boolean): Theme {
  if (pref === 'system') return systemPrefersDark ? 'dark' : 'light'
  return pref
}

export function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** Toggles the `dark` class on <html>; every dark style keys off it. */
export function applyTheme(pref: ThemePref, prefersDark: boolean = systemPrefersDark()): void {
  const theme = resolveTheme(pref, prefersDark)
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme // native controls (date picker, scrollbars) match
}
