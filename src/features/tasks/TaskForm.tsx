import { useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ErrorState } from '../../components/ErrorState'
import { LoadingState } from '../../components/LoadingState'
import type { NewTask, Task } from '../../data/types'
import { canEditContent } from '../../domain/permissions'
import { useMe } from '../auth/useMe'
import { useProjects } from '../projects/queries'
import { useProfiles } from '../team/queries'
import { useCreateTask, useTasks, useUpdateTask } from './queries'

/** Route element for /tasks/new and /tasks/:id/edit. */
export function TaskFormPage() {
  const { id } = useParams()
  if (!id) return <TaskForm />
  return <EditTask id={id} />
}

function EditTask({ id }: { id: string }) {
  const { me } = useMe()
  // No single-task endpoint: the team's task list is small and usually already cached.
  const tasks = useTasks()
  if (tasks.isPending || !me) return <LoadingState />
  if (tasks.isError) return <ErrorState error={tasks.error} />
  const task = tasks.data.find((t) => t.id === id)
  if (!task) return <ErrorState error={new Error('Task not found')} />
  if (!canEditContent(me, task.createdBy)) {
    return <ErrorState error={new Error('Only the creator or lead can edit this task')} />
  }
  return <TaskForm initial={task} />
}

const inputClass = 'mt-1 w-full rounded border border-gray-300 px-3 py-2'

type FieldErrors = Partial<Record<'project' | 'title' | 'assignee', string>>

function TaskForm({ initial }: { initial?: Task }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const fromProject = searchParams.get('projectId')
  const projects = useProjects()
  const profiles = useProfiles()
  const createTask = useCreateTask()
  const updateTask = useUpdateTask()

  const [projectId, setProjectId] = useState(initial?.projectId ?? fromProject ?? '')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [assignedTo, setAssignedTo] = useState(initial?.assignedTo ?? '')
  const [explanation, setExplanation] = useState(initial?.explanation ?? '')
  const [deadline, setDeadline] = useState(initial?.deadline ?? '')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const found: FieldErrors = {}
    if (!projectId) found.project = 'Project is required'
    if (!title.trim()) found.title = 'Title is required'
    if (!assignedTo) found.assignee = 'Assignee is required'
    setErrors(found)
    if (Object.keys(found).length > 0) return

    const values: NewTask = {
      projectId,
      title: title.trim(),
      assignedTo,
      explanation: explanation.trim() ? explanation : null,
      deadline: deadline || null, // empty date input = no deadline
    }

    setSubmitError(null)
    setSaving(true)
    try {
      if (initial) await updateTask.mutateAsync({ id: initial.id, patch: values })
      else await createTask.mutateAsync(values)
      navigate(fromProject ? `/projects/${fromProject}` : '/tasks', { replace: true })
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not save the task')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">{initial ? 'Edit task' : 'Assign task'}</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Project
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={inputClass}>
            <option value="">Choose…</option>
            {projects.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {errors.project && <span className="text-xs text-red-600">{errors.project}</span>}
        </label>

        <label className="block text-sm font-medium">
          Assignee
          <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className={inputClass}>
            <option value="">Choose…</option>
            {profiles.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
          {errors.assignee && <span className="text-xs text-red-600">{errors.assignee}</span>}
        </label>
      </div>

      <label className="block text-sm font-medium">
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
        {errors.title && <span className="text-xs text-red-600">{errors.title}</span>}
      </label>

      <label className="block text-sm font-medium">
        Explanation
        <textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} rows={5} className={inputClass} />
      </label>

      <label className="block text-sm font-medium sm:w-1/2">
        Deadline (optional)
        <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={inputClass} />
      </label>

      {submitError && <ErrorState error={new Error(submitError)} />}

      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
          {saving ? 'Saving…' : 'Save task'}
        </button>
        <button type="button" onClick={() => navigate(-1)} className="rounded px-4 py-2 text-sm hover:bg-gray-100">
          Cancel
        </button>
      </div>
    </form>
  )
}
