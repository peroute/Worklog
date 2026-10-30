// Adds DOM matchers like toBeInTheDocument() to Vitest's expect.
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Testing Library only auto-unmounts when Vitest globals are on; ours are off, so do it here.
// Otherwise components (and their page-wide listeners) leak from one test into the next.
// Also forget mock call history, so "was not called" can't be fooled by an earlier test.
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  // Saved UI preferences (theme, "show details") must not leak between tests. Node-only tests have no storage.
  globalThis.localStorage?.clear()
})

// jsdom has no object URLs (used for screenshot thumbnails); give it harmless stand-ins.
if (!URL.createObjectURL) {
  let n = 0
  URL.createObjectURL = () => `blob:test/${++n}`
  URL.revokeObjectURL = () => {}
}
