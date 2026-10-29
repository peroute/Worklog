import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Unit + component tests: fast, no network, run in a fake browser (jsdom).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
  },
})
