import { signIn, signOut } from '../../src/data/auth'
import { TEST_PASSWORD, TEST_USERS, type TestUser } from './admin'

/** Signs the app's real Supabase client in as a test user (exercises src/data/auth). */
export async function loginAs(who: TestUser): Promise<void> {
  await signOut()
  await signIn(TEST_USERS[who].email, TEST_PASSWORD)
}
