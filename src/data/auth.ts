import { supabase } from '../lib/supabase'
import { DataError } from './errors'

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    const wrongCredentials = error.code === 'invalid_credentials' || error.status === 400
    throw new DataError(wrongCredentials ? 'Wrong email or password' : error.message, error)
  }
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) throw new DataError(error.message, error)
}

export async function getSessionUserId(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw new DataError(error.message, error)
  return data.session?.user.id ?? null
}

/** Calls `cb` on sign-in/sign-out. Returns an unsubscribe function. */
export function onAuthChange(cb: (userId: string | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session?.user.id ?? null))
  return () => data.subscription.unsubscribe()
}
