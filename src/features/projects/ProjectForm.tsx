import { useState, type FormEvent } from 'react'
import { ui } from '../../components/ui'

export interface ProjectFormValues {
  name: string
  description: string | null
}

interface ProjectFormProps {
  initial?: ProjectFormValues
  submitLabel: string
  onSubmit: (values: ProjectFormValues) => Promise<unknown>
  onCancel: () => void
}

/** Create/edit form for a project. Shows the server's error (e.g. duplicate name) inline. */
export function ProjectForm({ initial, submitLabel, onSubmit, onCancel }: ProjectFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    setError(null)
    setSaving(true)
    try {
      await onSubmit({ name: name.trim(), description: description.trim() || null })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the project')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className={`${ui.card} space-y-4 p-5`}>
      <label className={ui.label}>
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Mobile App QA"
          className={ui.input}
        />
      </label>
      <label className={ui.label}>
        Description
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="What is this project about? (optional)"
          className={ui.input}
        />
      </label>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <button type="submit" disabled={saving} className={ui.btnPrimary}>
          {submitLabel}
        </button>
        <button type="button" onClick={onCancel} className={ui.btnSecondary}>
          Cancel
        </button>
      </div>
    </form>
  )
}
