import { useState } from 'react'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { LoadingState } from '../../components/LoadingState'
import { ui } from '../../components/ui'
import type { TrashItem } from '../../data/types'
import { formatDateTime } from '../../lib/dates'
import { nameOf, useProfiles } from '../team/queries'
import { useRestoreItem, useTrash } from './queries'

const TYPE_LABEL: Record<TrashItem['type'], string> = { project: 'Project', task: 'Task', finding: 'Finding' }

/** Everything soft-deleted, with a one-click Restore. Anyone on the team can restore. */
export function TrashPage() {
  const trash = useTrash()
  const profiles = useProfiles()
  const restore = useRestoreItem()
  const [error, setError] = useState<string | null>(null)

  async function onRestore(item: TrashItem) {
    setError(null)
    try {
      await restore.mutateAsync(item)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not restore')
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className={ui.pageTitle}>Trash</h1>
        <p className="mt-1 text-sm text-fg-muted">Deleted projects, tasks and findings. Restore brings them back as they were.</p>
      </div>
      {error && <ErrorState error={new Error(error)} />}
      {trash.isPending && <LoadingState />}
      {trash.isError && <ErrorState error={trash.error} />}
      {trash.data &&
        (trash.data.length === 0 ? (
          <EmptyState message="Trash is empty." />
        ) : (
          <ul className={`${ui.card} divide-y divide-line overflow-hidden`}>
            {trash.data.map((item) => (
              <li key={`${item.type}:${item.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                <span className={ui.tag}>{TYPE_LABEL[item.type]}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-fg">{item.title}</p>
                  <p className="text-xs text-fg-muted">
                    deleted by {item.deletedBy ? nameOf(profiles.data, item.deletedBy) : 'Unknown'} ·{' '}
                    {formatDateTime(item.deletedAt)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onRestore(item)}
                  disabled={restore.isPending}
                  className={ui.btnSecondary}
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        ))}
    </div>
  )
}
