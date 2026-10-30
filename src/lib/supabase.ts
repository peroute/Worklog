import { createClient } from '@supabase/supabase-js'

// The ONE Supabase client for the whole app. Only src/data/** may import it
// (enforced by eslint no-restricted-imports — see eslint.config.js).
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient(url, anonKey)
