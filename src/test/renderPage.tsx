import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { SessionProvider } from '../features/auth/SessionProvider'

/**
 * Mounts ONE page (plus stub routes for places it navigates to) with the providers it needs.
 * Unlike renderApp it doesn't import every page, so it works while other pages are mid-change.
 */
export function renderPage(
  element: ReactNode,
  { path, route, others = {} }: { path: string; route: string; others?: Record<string, ReactNode> },
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path={route} element={element} />
            {Object.entries(others).map(([pattern, node]) => (
              <Route key={pattern} path={pattern} element={node} />
            ))}
          </Routes>
        </MemoryRouter>
      </SessionProvider>
    </QueryClientProvider>,
  )
  return { ...view, queryClient }
}

/**
 * Mounts a single component with the providers it needs (query cache + router).
 * Same as the one in renderApp, minus the import of every page: usable while other pages are mid-change.
 */
export function renderWithProviders(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}
