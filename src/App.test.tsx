import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('./data/auth', () => import('./test/mockAuth').then((m) => m.authModule))
vi.mock('./data/findings', () => import('./test/mockData').then((m) => m.findingsModule))
vi.mock('./data/tasks', () => import('./test/mockData').then((m) => m.tasksModule))

describe('App', () => {
  it('renders without crashing (signed out → login screen)', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Worklog' })).toBeInTheDocument()
  })
})
