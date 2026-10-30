import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { getSessionUserId, signIn, signOut } from '../../src/data/auth'
import { TEST_PASSWORD, TEST_USERS } from './admin'

describe('auth', () => {
  it('lets a team member sign in and out', async () => {
    await signIn(TEST_USERS.hedi.email, TEST_PASSWORD)
    expect(await getSessionUserId()).not.toBeNull()
    await signOut()
    expect(await getSessionUserId()).toBeNull()
  })

  it('rejects a wrong password with a readable message', async () => {
    await expect(signIn(TEST_USERS.hedi.email, 'wrong-password')).rejects.toThrow('Wrong email or password')
  })

  it('does not let a stranger register an account (spec anti-goal)', async () => {
    const stranger = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    })
    const { data, error } = await stranger.auth.signUp({ email: 'stranger@evil.test', password: 'whatever-123' })
    expect(error).not.toBeNull()
    expect(data.user).toBeNull()
  })
})
