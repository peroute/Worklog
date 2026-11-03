import { useState } from 'react'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import type { Project } from '../../data/types'
import { useDeleteProject, useProjectDeleteCounts } from './queries'

interface DeleteProjectDialogProps {
  project: Project
  open: boolean
  onClose: () => void
  onDeleted: () => void
}

/** Anyone on the team. Counts exactly what goes to Trash before asking for confirmation. */
export function DeleteProjectDialog({ project, open, onClose, onDeleted }: DeleteProjectDialogProps) {
  const counts = useProjectDeleteCounts(project.id, open)
  const deleteProject = useDeleteProject()
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setError(null)
    try {
      await deleteProject.mutateAsync(project.id)
      onDeleted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the project')
    }
  }

  const summary = counts.data
    ? `That is ${counts.data.findings} findings (with ${counts.data.images} screenshots) and ${counts.data.tasks} tasks (with ${counts.data.attachments} attachments). You can restore it from Trash.`
    : counts.isError
      ? 'Could not count what will be moved.'
      : 'Counting what will be moved…'

  return (
    <ConfirmDialog
      open={open}
      title={`Delete “${project.name}”?`}
      body={
        <>
          <p>Moves the project and everything in it to Trash.</p>
          <p className="mt-2">{summary}</p>
          {error && (
            <p role="alert" className="mt-2 text-red-600">
              {error}
            </p>
          )}
        </>
      }
      confirmLabel="Delete project"
      busy={deleteProject.isPending}
      confirmDisabled={!counts.data}
      onConfirm={confirm}
      onCancel={onClose}
    />
  )
}
