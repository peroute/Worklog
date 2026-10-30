import type { ReactNode } from 'react'

export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
      <p>{message}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
