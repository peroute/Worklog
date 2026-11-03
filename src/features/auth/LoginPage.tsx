import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, type Location } from 'react-router-dom'
import { ui } from '../../components/ui'
import { signIn } from '../../data/auth'
import { useSession } from './SessionProvider'

/** Email + password only. No sign-up link: accounts are created by an admin (spec §6). */
export function LoginPage() {
  const userId = useSession()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Once signed in (here or in another tab), continue to where the user was going.
  if (userId) {
    const from = (location.state as { from?: Location } | null)?.from?.pathname ?? '/'
    return <Navigate to={from} replace />
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await signIn(email.trim(), password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span
            aria-hidden="true"
            className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-lg font-semibold text-white shadow-md"
          >
            W
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Worklog</h1>
          <p className="mt-1 text-sm text-fg-muted">Sign in with your team account</p>
        </div>

        <form onSubmit={onSubmit} className={`${ui.card} space-y-4 p-6`}>
          <label className={ui.label}>
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={ui.input}
            />
          </label>

          <label className={ui.label}>
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={ui.input}
            />
          </label>

          {error && (
            <p role="alert" className="rounded-lg bg-overdue-soft px-3 py-2 text-sm text-overdue">
              {error}
            </p>
          )}

          <button type="submit" disabled={submitting} className={`${ui.btnPrimary} w-full py-2.5`}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  )
}
