// Shared Tailwind class strings, so every page uses the same button, input and card.
// Only semantic tokens (see src/index.css), so everything works in light and dark mode.
import type { FindingStatus, TaskStatus } from '../data/types'

const buttonBase =
  'inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

export const ui = {
  btnPrimary: `${buttonBase} bg-accent text-white shadow-sm hover:bg-accent-hover`,
  btnSecondary: `${buttonBase} border border-line bg-surface text-fg shadow-sm hover:bg-surface-2`,
  btnGhost: `${buttonBase} text-fg-muted hover:bg-surface-2 hover:text-fg`,
  btnDanger: `${buttonBase} bg-red-600 text-white shadow-sm hover:bg-red-700`,
  btnDangerGhost: `${buttonBase} text-overdue hover:bg-overdue-soft`,
  iconBtn:
    'inline-flex h-9 w-9 items-center justify-center rounded-lg text-lg text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg',
  link: 'font-medium text-accent-fg hover:underline',

  card: 'rounded-xl border border-line bg-surface shadow-sm dark:shadow-none',
  label: 'block text-sm font-medium text-fg',
  input:
    'mt-1.5 block w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-fg shadow-sm ' +
    'placeholder:text-fg-subtle focus:border-accent focus:ring-2 focus:ring-accent/25 focus:outline-none ' +
    'disabled:bg-surface-2 disabled:text-fg-subtle',
  select:
    'rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-sm text-fg shadow-sm focus:border-accent ' +
    'focus:ring-2 focus:ring-accent/25 focus:outline-none',
  fieldError: 'mt-1 block text-xs font-medium text-overdue',
  sectionTitle: 'text-xs font-semibold tracking-wider text-fg-muted uppercase',
  pageTitle: 'text-2xl font-semibold tracking-tight text-fg',
  tag: 'inline-flex items-center rounded-md bg-surface-2 px-1.5 py-0.5 text-xs font-medium text-fg-muted',
} as const

/** Colored left edge for an item. The color says whose turn it is (spec §9). */
export const edge = {
  neutral: 'border-l-[3px] border-l-line-strong', // slate: to do / in progress, nobody waiting on it
  waiting: 'border-l-[3px] border-l-open-edge', // amber: open finding, or task waiting for review
  review: 'border-l-[3px] border-l-review-edge', // violet: needs more info
  fixed: 'border-l-[3px] border-l-fixed-edge', // sky: fixed, waiting for a re-check
  done: 'border-l-[3px] border-l-done-edge', // green: verified / done
  overdue: 'border-l-[3px] border-l-overdue-edge', // red: blocked, or past its deadline
  muted: 'border-l-[3px] border-l-fg-subtle', // grey: not a bug
} as const

export function statusEdge(status: FindingStatus | TaskStatus, overdue = false): string {
  switch (status) {
    case 'open':
    case 'waiting_for_review':
      return edge.waiting
    case 'needs_info':
      return edge.review
    case 'fixed':
      return edge.fixed
    case 'verified':
    case 'done':
      return edge.done
    case 'blocked':
      return edge.overdue
    case 'not_a_bug':
      return edge.muted
    case 'todo':
    case 'in_progress':
      return overdue ? edge.overdue : edge.neutral
  }
}
