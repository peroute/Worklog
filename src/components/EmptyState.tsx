import type { ReactNode } from 'react'

export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong px-6 py-8 text-center">
      <p className="text-sm text-fg-muted">{message}</p>
      {action && <div className="mt-3 text-sm">{action}</div>}
    </div>
  )
}
