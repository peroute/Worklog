import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { signOut } from '../../data/auth'
import { useMe } from '../auth/useMe'

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`

/** Top nav + page content. Shown for every signed-in route. */
export function AppLayout() {
  const { me } = useMe()
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
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white">
        <nav className="mx-auto flex max-w-6xl items-center gap-1 px-4 py-2">
          <span className="mr-4 font-semibold">Worklog</span>
          <NavLink to="/" end className={navClass}>
            Today
          </NavLink>
          <NavLink to="/projects" className={navClass}>
            Projects
          </NavLink>
          <NavLink to="/tasks" className={navClass}>
            Tasks
          </NavLink>
          <span className="ml-auto text-sm text-gray-600">{me?.displayName}</span>
          <button type="button" onClick={onSignOut} className="ml-3 rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100">
            Sign out
          </button>
        </nav>
        {error && (
          <p role="alert" className="mx-auto max-w-6xl px-4 pb-2 text-sm text-red-600">
            {error}
          </p>
        )}
      </header>
      <main className="mx-auto max-w-6xl p-4">
        <Outlet />
      </main>
    </div>
  )
}
