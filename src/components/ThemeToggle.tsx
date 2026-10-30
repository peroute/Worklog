import { useEffect, useState } from 'react'
import { applyTheme, readThemePref, saveThemePref, type ThemePref } from '../lib/theme'

const OPTIONS: { pref: ThemePref; icon: string; label: string }[] = [
  { pref: 'light', icon: '☀', label: 'Light theme' },
  { pref: 'system', icon: '◐', label: 'System theme' },
  { pref: 'dark', icon: '☾', label: 'Dark theme' },
]

/** Three-way switch: light / follow the system / dark. Remembered per browser. */
export function ThemeToggle() {
  const [pref, setPref] = useState<ThemePref>(readThemePref)

  useEffect(() => {
    applyTheme(pref)
    if (pref !== 'system' || typeof window.matchMedia !== 'function') return
    // On "system", follow the OS live (e.g. Windows switching to dark at sunset).
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [pref])

  function choose(next: ThemePref) {
    saveThemePref(next)
    setPref(next)
  }

  return (
    <div role="group" aria-label="Theme" className="flex rounded-lg border border-line bg-surface-2 p-0.5">
      {OPTIONS.map(({ pref: option, icon, label }) => (
        <button
          key={option}
          type="button"
          aria-label={label}
          aria-pressed={pref === option}
          title={label}
          onClick={() => choose(option)}
          className={`h-7 w-7 rounded-md text-sm transition-colors ${
            pref === option ? 'bg-surface text-fg shadow-sm' : 'text-fg-subtle hover:text-fg'
          }`}
        >
          <span aria-hidden="true">{icon}</span>
        </button>
      ))}
    </div>
  )
}
