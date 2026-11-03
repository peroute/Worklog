import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatusBadge } from './StatusBadge'
import { edge, statusEdge } from './ui'

describe('StatusBadge', () => {
  it.each([
    ['open', 'Open'],
    ['needs_info', 'Need more info'],
    ['fixed', 'Fixed, please re-check'],
    ['not_a_bug', 'Not a bug'],
    ['verified', 'Verified'],
    ['todo', 'To do'],
    ['in_progress', 'In progress'],
    ['blocked', 'Blocked'],
    ['waiting_for_review', 'Waiting for review'],
    ['done', 'Done'],
  ] as const)('labels %s as "%s"', (status, label) => {
    render(<StatusBadge status={status} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })
})

// The color says whose turn it is (spec §9).
describe('statusEdge', () => {
  it('is amber for open and waiting for review', () => {
    expect(statusEdge('open')).toBe(edge.waiting)
    expect(statusEdge('waiting_for_review')).toBe(edge.waiting)
  })
  it('is violet when more info is needed', () => {
    expect(statusEdge('needs_info')).toBe(edge.review)
  })
  it('is sky when fixed', () => {
    expect(statusEdge('fixed')).toBe(edge.fixed)
  })
  it('is red when blocked', () => {
    expect(statusEdge('blocked')).toBe(edge.overdue)
  })
  it('is green when verified or done', () => {
    expect(statusEdge('verified')).toBe(edge.done)
    expect(statusEdge('done')).toBe(edge.done)
  })
  it('is grey for not a bug', () => {
    expect(statusEdge('not_a_bug')).toBe(edge.muted)
  })
  it('is slate for to do and in progress, red once a to-do is overdue', () => {
    expect(statusEdge('todo')).toBe(edge.neutral)
    expect(statusEdge('in_progress')).toBe(edge.neutral)
    expect(statusEdge('todo', true)).toBe(edge.overdue)
    expect(statusEdge('in_progress', true)).toBe(edge.overdue)
  })
})
