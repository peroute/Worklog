import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

// Integration tests: talk to the LOCAL Supabase stack (`npx supabase start`, then `npm run env:local`).
// Run in Node, one file at a time, because tests share real database state.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    fileParallelism: false,
    passWithNoTests: true,
    // Load every var from .env.test (not just VITE_*) so setup can read the service role key.
    env: loadEnv('test', process.cwd(), ''),
    globalSetup: ['./tests/integration/globalSetup.ts'],
    testTimeout: 20000,
  },
})
