import type { FindingStatus, TaskStatus } from '../data/types'

const STYLES: Record<FindingStatus | TaskStatus, { label: string; pill: string; dot: string }> = {
  open: { label: 'Open', pill: 'bg-open-soft text-open ring-open-edge/40', dot: 'bg-open-edge' },
  closed: { label: 'Closed', pill: 'bg-done-soft text-done ring-done-edge/40', dot: 'bg-done-edge' },
  todo: { label: 'To do', pill: 'bg-surface-2 text-fg-muted ring-line-strong', dot: 'bg-fg-subtle' },
  done: { label: 'Done', pill: 'bg-done-soft text-done ring-done-edge/40', dot: 'bg-done-edge' },
}

export function StatusBadge({ status }: { status: FindingStatus | TaskStatus }) {
  const { label, pill, dot } = STYLES[status]
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${pill}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  )
}
