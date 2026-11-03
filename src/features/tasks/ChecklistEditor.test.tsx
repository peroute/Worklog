import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { DraftItem } from '../../domain/checklist'
import { ChecklistEditor } from './ChecklistEditor'

/** Keeps the list in state like TaskForm does, and records every change. */
function Harness({ initial, onChange }: { initial: DraftItem[]; onChange: (items: DraftItem[]) => void }) {
  const [items, setItems] = useState(initial)
  const [pending, setPending] = useState('')
  return (
    <ChecklistEditor
      pending={pending}
      onPendingChange={setPending}
      items={items}
      onChange={(next) => {
        setItems(next)
        onChange(next)
      }}
    />
  )
}

const two: DraftItem[] = [
  { id: 'a', title: 'Reproduce' },
  { id: 'b', title: 'Fix' },
]

describe('ChecklistEditor', () => {
  it('adds a trimmed item at the end on Enter', async () => {
    const onChange = vi.fn()
    render(<Harness initial={two} onChange={onChange} />)
    await userEvent.type(screen.getByPlaceholderText('Add an item…'), '  Test on 3 versions {enter}')
    expect(onChange).toHaveBeenLastCalledWith([...two, { title: 'Test on 3 versions' }])
    expect(screen.getByPlaceholderText('Add an item…')).toHaveValue('')
  })

  it('refuses a blank item', async () => {
    const onChange = vi.fn()
    render(<Harness initial={two} onChange={onChange} />)
    await userEvent.type(screen.getByPlaceholderText('Add an item…'), '   {enter}')
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText('Items need 1–200 characters')).toBeInTheDocument()
  })

  it('removes an item', async () => {
    const onChange = vi.fn()
    render(<Harness initial={two} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove Reproduce' }))
    expect(onChange).toHaveBeenLastCalledWith([{ id: 'b', title: 'Fix' }])
  })

  it('moves an item up', async () => {
    const onChange = vi.fn()
    render(<Harness initial={two} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Move Fix up' }))
    expect(onChange).toHaveBeenLastCalledWith([two[1], two[0]])
  })

  it('stops at 50 items', () => {
    const full = Array.from({ length: 50 }, (_, i) => ({ title: `Step ${i}` }))
    render(<Harness initial={full} onChange={vi.fn()} />)
    expect(screen.getByPlaceholderText('Add an item…')).toBeDisabled()
    expect(screen.getByText('Checklist is full (50 items)')).toBeInTheDocument()
  })
})
