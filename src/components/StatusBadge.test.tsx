import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatusBadge } from './StatusBadge'
import { edge, statusEdge } from './ui'

describe('StatusBadge', () => {
  it.each([
    ['open', 'Open'],
    ['needs_review', 'Needs review'],
    ['fixed', 'Fixed'],
    ['closed', 'Closed'],
    ['todo', 'To do'],
    ['done', 'Done'],
    ['approved', 'Approved'],
  ] as const)('labels %s as "%s"', (status, label) => {
    render(<StatusBadge status={status} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })
})

// The color says whose turn it is (review-flow spec §3).
describe('statusEdge', () => {
  it('is amber while waiting for the lead', () => {
    expect(statusEdge('open')).toBe(edge.waiting)
    expect(statusEdge('done')).toBe(edge.waiting)
  })
  it('is violet when sent back', () => {
    expect(statusEdge('needs_review')).toBe(edge.review)
  })
  it('is sky when fixed', () => {
    expect(statusEdge('fixed')).toBe(edge.fixed)
  })
  it('is green when approved or closed', () => {
    expect(statusEdge('approved')).toBe(edge.done)
    expect(statusEdge('closed')).toBe(edge.done)
  })
  it('is gray for to do, red once overdue', () => {
    expect(statusEdge('todo')).toBe(edge.neutral)
    expect(statusEdge('todo', true)).toBe(edge.overdue)
  })
})
