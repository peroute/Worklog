import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatusBadge } from './StatusBadge'
import { edge, statusEdge } from './ui'

describe('StatusBadge', () => {
  it.each([
    ['todo', 'To do'],
    ['submitted', 'Submitted'],
    ['changes_requested', 'Changes requested'],
    ['resubmitted', 'Resubmitted'],
    ['approved', 'Approved'],
  ] as const)('labels %s as "%s"', (status, label) => {
    render(<StatusBadge status={status} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })
})

// The color says whose turn it is (review-flow spec §3).
describe('statusEdge', () => {
  it('is amber while waiting for the lead', () => {
    expect(statusEdge('submitted')).toBe(edge.waiting)
  })
  it('is violet when changes are requested', () => {
    expect(statusEdge('changes_requested')).toBe(edge.review)
  })
  it('is sky when resubmitted', () => {
    expect(statusEdge('resubmitted')).toBe(edge.fixed)
  })
  it('is green when approved', () => {
    expect(statusEdge('approved')).toBe(edge.done)
  })
  it('is gray for to do, red once overdue', () => {
    expect(statusEdge('todo')).toBe(edge.neutral)
    expect(statusEdge('todo', true)).toBe(edge.overdue)
  })
})
