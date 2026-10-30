import { vi } from 'vitest'

/**
 * Shared fake for src/data/auth. Use in a test file with:
 *   vi.mock('<path>/data/auth', () => import('<path>/test/mockAuth').then((m) => m.authModule))
 * then drive it with `auth.signedInAs(...)` / `auth.emitChange(...)`.
 */
let listener: ((userId: string | null) => void) | null = null

export const authModule = {
  signIn: vi.fn<(email: string, password: string) => Promise<void>>(),
  signOut: vi.fn<() => Promise<void>>(async () => {}),
  getSessionUserId: vi.fn<() => Promise<string | null>>(async () => null),
  onAuthChange: vi.fn((cb: (userId: string | null) => void) => {
    listener = cb
    return () => {
      listener = null
    }
  }),
}

export const auth = {
  /** Start the test already signed in (or signed out with null). */
  signedInAs(userId: string | null) {
    authModule.getSessionUserId.mockResolvedValue(userId)
  },
  /** Simulate Supabase reporting a sign-in/sign-out. */
  emitChange(userId: string | null) {
    listener?.(userId)
  },
}
