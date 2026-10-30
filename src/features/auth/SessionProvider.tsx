import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { getSessionUserId, onAuthChange } from '../../data/auth'

/** undefined = still checking, null = signed out, string = signed-in user id. */
type SessionState = string | null | undefined

const SessionContext = createContext<SessionState>(undefined)

/**
 * Asks "who is signed in?" once, then listens for sign-in/sign-out.
 * Every component below reads the same answer via useSession() — one source of truth.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<SessionState>(undefined)

  useEffect(() => {
    let active = true
    getSessionUserId()
      // Only fill in the initial answer; a sign-in/out event that arrived first wins.
      .then((id) => active && setUserId((current) => (current === undefined ? id : current)))
      .catch(() => active && setUserId(null))
    const unsubscribe = onAuthChange((id) => setUserId(id))
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  return <SessionContext.Provider value={userId}>{children}</SessionContext.Provider>
}

export function useSession(): SessionState {
  return useContext(SessionContext)
}
