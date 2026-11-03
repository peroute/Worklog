import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import { AppRoutes } from './AppRoutes'
import { getMyProfile, listProfiles } from './data/profiles'
import { SessionProvider } from './features/auth/SessionProvider'
import { hedi } from './test/factories'
import { auth } from './test/mockAuth'

vi.mock('./data/auth', () => import('./test/mockAuth').then((m) => m.authModule))
vi.mock('./data/findings', () => import('./test/mockData').then((m) => m.findingsModule))
vi.mock('./data/tasks', () => import('./test/mockData').then((m) => m.tasksModule))
vi.mock('./data/profiles', () => import('./test/mockData').then((m) => m.profilesModule))
vi.mock('./data/projects', () => import('./test/mockData').then((m) => m.projectsModule))
vi.mock('./data/comments', () => import('./test/mockData').then((m) => m.commentsModule))
vi.mock('./data/reads', () => import('./test/mockData').then((m) => m.readsModule))

function LocationProbe() {
  return <p data-testid="location">{useLocation().pathname}</p>
}

describe('App', () => {
  it('renders without crashing (signed out → login screen)', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Worklog' })).toBeInTheDocument()
  })

  it('/review redirects to /inbox', async () => {
    auth.signedInAs(hedi.id)
    vi.mocked(getMyProfile).mockResolvedValue(hedi)
    vi.mocked(listProfiles).mockResolvedValue([hedi])
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <SessionProvider>
          <MemoryRouter initialEntries={['/review']}>
            <AppRoutes />
            <LocationProbe />
          </MemoryRouter>
        </SessionProvider>
      </QueryClientProvider>,
    )
    expect(await screen.findByRole('heading', { level: 1, name: 'Your turn' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/inbox')
  })
})
