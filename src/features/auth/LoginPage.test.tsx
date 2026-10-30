import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DataError } from '../../data/errors'
import { getMyProfile } from '../../data/profiles'
import { hedi } from '../../test/factories'
import { auth, authModule } from '../../test/mockAuth'
import { renderApp } from '../../test/renderApp'

vi.mock('../../data/auth', () => import('../../test/mockAuth').then((m) => m.authModule))
vi.mock('../../data/profiles', () => ({ getMyProfile: vi.fn(), listProfiles: vi.fn(async () => []) }))
vi.mock('../../data/findings', () => import('../../test/mockData').then((m) => m.findingsModule))
vi.mock('../../data/tasks', () => import('../../test/mockData').then((m) => m.tasksModule))

async function fillAndSubmit(email: string, password: string) {
  await userEvent.type(await screen.findByLabelText('Email'), email)
  await userEvent.type(screen.getByLabelText('Password'), password)
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('LoginPage', () => {
  beforeEach(() => {
    auth.signedInAs(null)
    vi.mocked(getMyProfile).mockResolvedValue(hedi)
  })

  it('shows a readable error on a wrong password', async () => {
    authModule.signIn.mockRejectedValueOnce(new DataError('Wrong email or password'))
    renderApp('/login')
    await fillAndSubmit('hedi@test.local', 'nope')
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password')
  })

  it('signs in and continues to the page the user was going to', async () => {
    authModule.signIn.mockImplementationOnce(async () => auth.emitChange(hedi.id))
    renderApp('/projects')
    await fillAndSubmit('hedi@test.local', 'right-password')
    expect(authModule.signIn).toHaveBeenCalledWith('hedi@test.local', 'right-password')
    expect(await screen.findByRole('heading', { name: 'Projects' })).toBeInTheDocument()
  })

  it('offers no way to sign up (accounts are created by the lead)', async () => {
    renderApp('/login')
    await screen.findByRole('button', { name: 'Sign in' })
    expect(screen.queryByText(/sign up/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/register/i)).not.toBeInTheDocument()
  })
})
