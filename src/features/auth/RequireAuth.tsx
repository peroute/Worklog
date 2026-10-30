import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { LoadingState } from '../../components/LoadingState'
import { useSession } from './SessionProvider'

/** Route guard: signed-out visitors go to /login, remembering where they were headed. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const userId = useSession()
  const location = useLocation()

  if (userId === undefined) return <LoadingState />
  if (userId === null) return <Navigate to="/login" replace state={{ from: location }} />
  return children
}
