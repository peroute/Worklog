import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getMyProfile } from '../../data/profiles'
import { hedi } from '../../test/factories'
import { auth, authModule } from '../../test/mockAuth'
import { renderApp } from '../../test/renderApp'

vi.mock('../../data/auth', () => import('../../test/mockAuth').then((m) => m.authModule))
vi.mock('../../data/profiles', () => ({ getMyProfile: vi.fn(), listProfiles: vi.fn(async () => []) }))
vi.mock('../../data/findings', () => import('../../test/mockData').then((m) => m.findingsModule))
vi.mock('../../data/tasks', () => import('../../test/mockData').then((m) => m.tasksModule))

describe('RequireAuth', () => {
  beforeEach(() => {
    vi.mocked(getMyProfile).mockResolvedValue(hedi)
  })

  it('sends a signed-out visitor to the login page', async () => {
    auth.signedInAs(null)
    renderApp('/projects')
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  })

  it("shows the app layout with the signed-in user's name", async () => {
    auth.signedInAs(hedi.id)
    renderApp('/')
    expect(await screen.findByText('Hedi')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Projects' })).toBeInTheDocument()
  })

  it('signs out and returns to the login page', async () => {
    auth.signedInAs(hedi.id)
    renderApp('/')
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
    expect(authModule.signOut).toHaveBeenCalled()
    auth.emitChange(null)
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  })
})
