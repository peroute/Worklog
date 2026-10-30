import type { FindingStatus, TaskStatus } from '../data/types'

const STYLES: Record<FindingStatus | TaskStatus, { label: string; className: string }> = {
  open: { label: 'Open', className: 'bg-amber-100 text-amber-800' },
  closed: { label: 'Closed', className: 'bg-green-100 text-green-800' },
  todo: { label: 'To do', className: 'bg-gray-100 text-gray-700' },
  done: { label: 'Done', className: 'bg-green-100 text-green-800' },
}

export function StatusBadge({ status }: { status: FindingStatus | TaskStatus }) {
  const { label, className } = STYLES[status]
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>{label}</span>
}
