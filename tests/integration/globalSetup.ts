import { loadEnv } from 'vite'
import { serviceClient, TEST_PASSWORD, TEST_USERS } from './admin'

/**
 * Runs once before all integration tests: makes sure the 3 test accounts exist
 * (public sign-up is off, so they're created with the admin API) and that Lead is the lead.
 */
export default async function setup(): Promise<void> {
  const admin = serviceClient(loadEnv('test', process.cwd(), ''))

  const { data: existing, error: listError } = await admin.auth.admin.listUsers()
  if (listError) throw listError
  const existingEmails = new Set(existing.users.map((u) => u.email))

  for (const { email, displayName } of Object.values(TEST_USERS)) {
    if (existingEmails.has(email)) continue
    const { error } = await admin.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    })
    if (error) throw error
  }

  const { error: roleError } = await admin
    .from('profiles')
    .update({ role: 'lead' })
    .eq('display_name', TEST_USERS.lead.displayName)
  if (roleError) throw roleError
}
