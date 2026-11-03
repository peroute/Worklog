import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { StatusActions } from './StatusActions'

describe('StatusActions', () => {
  it('primary shows buttons', async () => {
    const onRun = vi.fn(async () => {})
    render(<StatusActions actions={['verify', 'stillBroken']} primary onRun={onRun} />)
    expect(screen.getByRole('button', { name: 'Verified' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Verified' }))
    expect(onRun).toHaveBeenCalledWith('verify', undefined)
  })

  it('non-primary hides them under More', async () => {
    const onRun = vi.fn(async () => {})
    render(<StatusActions actions={['markFixed', 'notABug']} primary={false} onRun={onRun} />)
    expect(screen.queryByRole('button', { name: 'Mark fixed' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'More' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Mark fixed' }))
    expect(onRun).toHaveBeenCalledWith('markFixed', undefined)
  })

  it('comment-required action blocks blank submit', async () => {
    const onRun = vi.fn(async () => {})
    render(<StatusActions actions={['needInfo']} primary onRun={onRun} />)
    await userEvent.click(screen.getByRole('button', { name: 'Need more info' }))

    const dialog = screen.getByRole('dialog', { name: 'Need more info' })
    const send = within(dialog).getByRole('button', { name: 'Need more info' })
    expect(send).toBeDisabled()
    await userEvent.type(within(dialog).getByLabelText('Comment'), '   ')
    expect(send).toBeDisabled()
    await userEvent.type(within(dialog).getByLabelText('Comment'), 'Which browser?')
    await userEvent.click(send)
    expect(onRun).toHaveBeenCalledWith('needInfo', 'Which browser?')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('block asks for a reason', async () => {
    const onRun = vi.fn(async () => {})
    render(<StatusActions actions={['block']} primary onRun={onRun} />)
    await userEvent.click(screen.getByRole('button', { name: 'Blocked…' }))
    const dialog = screen.getByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText("What's blocking it?"), 'Waiting for IT')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Blocked…' }))
    expect(onRun).toHaveBeenCalledWith('block', 'Waiting for IT')
  })

  it('closes the More menu on Escape and on an outside click', async () => {
    render(
      <div>
        <p>outside</p>
        <StatusActions actions={['markFixed']} primary={false} onRun={vi.fn(async () => {})} />
      </div>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'More' }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'More' }))
    await userEvent.click(screen.getByText('outside'))
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument()
  })

  it('closes the dialog on Escape', async () => {
    render(<StatusActions actions={['needInfo']} primary onRun={vi.fn(async () => {})} />)
    await userEvent.click(screen.getByRole('button', { name: 'Need more info' }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps the dialog open and shows the error when the action is refused', async () => {
    const onRun = vi.fn(async () => {
      throw new Error('Not allowed')
    })
    render(<StatusActions actions={['reply']} primary onRun={onRun} />)
    await userEvent.click(screen.getByRole('button', { name: 'Reply' }))
    await userEvent.type(screen.getByLabelText('Comment'), 'hi')
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reply' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Not allowed')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shows the error under the buttons when a one-click action is refused', async () => {
    const onRun = vi.fn(async () => {
      throw new Error('Not allowed')
    })
    render(<StatusActions actions={['verify']} primary onRun={onRun} />)
    await userEvent.click(screen.getByRole('button', { name: 'Verified' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Not allowed')
  })
})
