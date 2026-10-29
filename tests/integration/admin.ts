import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type TestUser = 'lead' | 'hedi' | 'khaushik'

export const TEST_PASSWORD = 'test-password-123'

export const TEST_USERS: Record<TestUser, { email: string; displayName: string }> = {
  lead: { email: 'lead@test.local', displayName: 'Lead' },
  hedi: { email: 'hedi@test.local', displayName: 'Hedi' },
  khaushik: { email: 'khaushik@test.local', displayName: 'Khaushik' },
}

export const BUCKET = 'finding-images'

/** Admin client: bypasses RLS. Test setup/cleanup only — never used by app code. */
export function serviceClient(env: Record<string, string | undefined> = process.env): SupabaseClient {
  const url = env.VITE_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — run `npm run env:local`')
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

/** Looks up a test user's id (= profile id). */
export async function userId(who: TestUser): Promise<string> {
  const { data, error } = await serviceClient()
    .from('profiles')
    .select('id')
    .eq('display_name', TEST_USERS[who].displayName)
    .single()
  if (error) throw error
  return data.id as string
}

/** Wipes all app data and screenshot files so each test file starts clean. */
export async function resetData(): Promise<void> {
  const admin = serviceClient()
  const { error } = await admin.from('projects').delete().not('id', 'is', null)
  if (error) throw error
  await removeAllFiles(admin)
}

async function removeAllFiles(admin: SupabaseClient): Promise<void> {
  const { data: folders, error } = await admin.storage.from(BUCKET).list('findings', { limit: 1000 })
  if (error) throw error
  for (const folder of folders ?? []) {
    const files = await listFiles(`findings/${folder.name}`)
    if (files.length > 0) {
      const { error: removeError } = await admin.storage.from(BUCKET).remove(files)
      if (removeError) throw removeError
    }
  }
}

/** Lists file paths inside one storage folder (admin view). */
export async function listFiles(folder: string): Promise<string[]> {
  const { data, error } = await serviceClient().storage.from(BUCKET).list(folder, { limit: 1000 })
  if (error) throw error
  return (data ?? []).map((f) => `${folder}/${f.name}`)
}

/** A tiny valid WebP-typed blob (content doesn't need to decode; Storage checks the MIME type). */
export function fakeImage(type = 'image/webp'): Blob {
  return new Blob([new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80])], { type })
}
