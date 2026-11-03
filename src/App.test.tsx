import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import { getMyProfile, listProfiles } from './data/profiles'
import { hedi } from './test/factories'
import { auth } from './test/mockAuth'
import { renderApp } from './test/renderApp'

vi.mock('./data/auth', () => import('./test/mockAuth').then((m) => m.authModule))
vi.mock('./data/findings', () => import('./test/mockData').then((m) => m.findingsModule))
vi.mock('./data/tasks', () => import('./test/mockData').then((m) => m.tasksModule))
vi.mock('./data/profiles', () => import('./test/mockData').then((m) => m.profilesModule))
vi.mock('./data/projects', () => import('./test/mockData').then((m) => m.projectsModule))
vi.mock('./data/comments', () => import('./test/mockData').then((m) => m.commentsModule))
vi.mock('./data/reads', () => import('./test/mockData').then((m) => m.readsModule))

describe('App', () => {
  it('renders without crashing (signed out → login screen)', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Worklog' })).toBeInTheDocument()
  })

  it('/review redirects to /inbox', async () => {
    auth.signedInAs(hedi.id)
    vi.mocked(getMyProfile).mockResolvedValue(hedi)
    vi.mocked(listProfiles).mockResolvedValue([hedi])
    renderApp('/review')
    expect(await screen.findByRole('heading', { level: 1, name: 'Your turn' })).toBeInTheDocument()
  })
})
