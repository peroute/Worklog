import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('./data/auth', () => import('./test/mockAuth').then((m) => m.authModule))

describe('App', () => {
  it('renders without crashing (signed out → login screen)', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Worklog' })).toBeInTheDocument()
  })
})
