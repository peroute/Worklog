import { defineConfig } from 'vitest/config'

// Integration tests: talk to the LOCAL Supabase stack (`npx supabase start`).
// Run in Node, one file at a time, because tests share real database state.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    fileParallelism: false,
    passWithNoTests: true,
  },
})
