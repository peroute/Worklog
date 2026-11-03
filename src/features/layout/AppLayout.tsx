import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Avatar } from '../../components/Avatar'
import { ErrorState } from '../../components/ErrorState'
import { ThemeToggle } from '../../components/ThemeToggle'
import { ui } from '../../components/ui'
import { signOut } from '../../data/auth'
import { useMe } from '../auth/useMe'
import { useInbox } from '../inbox/queries'

const navClass = ({ isActive }: { isActive: boolean }) =>
  `shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
    isActive ? 'bg-accent-soft text-accent-fg' : 'text-fg-muted hover:bg-surface-2 hover:text-fg'
  }`

export function BrandMark() {
  return (
    <span className="flex items-center gap-2 font-semibold tracking-tight text-fg">
      <span
        aria-hidden="true"
        className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-sm text-white"
      >
        W
      </span>
      Worklog
    </span>
  )
}

/** Sticky top bar + page content. Shown for every signed-in route. */
export function AppLayout() {
  const { me } = useMe()
  const { count } = useInbox()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  async function onSignOut() {
    setError(null)
    try {
      await signOut()
      queryClient.clear() // don't leave one user's cached data around for the next
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign out')
    }
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-line bg-surface/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
          <BrandMark />
          {/* One nav: its own swipeable row on phones (order-last, full width), inline from md up. */}
          <nav
            aria-label="Main"
            className="order-last -mx-1 flex w-full gap-1 overflow-x-auto px-1 md:order-none md:mx-0 md:w-auto md:px-0"
          >
            <NavLink to="/" end className={navClass}>
              Today
            </NavLink>
            <NavLink to="/projects" className={navClass}>
              Projects
            </NavLink>
            <NavLink to="/tasks" className={navClass}>
              Tasks
            </NavLink>
            <NavLink to="/inbox" className={navClass}>
              <span className="flex items-center gap-1.5">
                Your turn
                {count > 0 && (
                  <span className="rounded-full bg-open-edge px-1.5 text-xs font-semibold text-white">{count}</span>
                )}
              </span>
            </NavLink>
            <NavLink to="/trash" className={navClass}>
              Trash
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            {me && (
              <span className="flex items-center gap-2 text-sm text-fg">
                <Avatar id={me.id} name={me.displayName} size="sm" />
                <span className="hidden sm:inline">{me.displayName}</span>
              </span>
            )}
            <button type="button" onClick={onSignOut} className={ui.btnGhost}>
              Sign out
            </button>
          </div>
        </div>
        {error && (
          <div className="mx-auto max-w-7xl px-4 pb-2 sm:px-6">
            <ErrorState error={new Error(error)} />
          </div>
        )}
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  )
}
