import { useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ErrorState } from '../../components/ErrorState'
import { LoadingState } from '../../components/LoadingState'
import { FileChip, RemoveBadge } from '../../components/FileDropzone'
import { ui } from '../../components/ui'
import { isImage } from '../../data/attachmentRules'
import type { NewTask, Task, TaskAttachment } from '../../data/types'
import { canEditContent, canRemoveTaskAttachment } from '../../domain/permissions'
import { useMe } from '../auth/useMe'
import { useProjects } from '../projects/queries'
import { useProfiles } from '../team/queries'
import { AttachmentInput } from './AttachmentInput'
import { prepareAttachment } from './prepareAttachment'
import { useCreateTask, useTaskAttachments, useTasks, useUpdateTask } from './queries'

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
  const attachments = useTaskAttachments(id)
  if (tasks.isPending || attachments.isPending || !me) return <LoadingState />
  if (tasks.isError) return <ErrorState error={tasks.error} />
  if (attachments.isError) return <ErrorState error={attachments.error} />
  const task = tasks.data.find((t) => t.id === id)
  if (!task) return <ErrorState error={new Error('Task not found')} />
  if (!canEditContent(me, task.createdBy)) {
    return <ErrorState error={new Error('Only the creator or lead can edit this task')} />
  }
  return <TaskForm initial={task} initialAttachments={attachments.data} />
}

type FieldErrors = Partial<Record<'title' | 'assignee', string>>

function TaskForm({ initial, initialAttachments = [] }: { initial?: Task; initialAttachments?: TaskAttachment[] }) {
  const navigate = useNavigate()
  const { me } = useMe()
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
  const [newFiles, setNewFiles] = useState<File[]>([])
  // Saved attachments the user clicked × on. Only deleted on Save, so Cancel undoes it.
  const [removed, setRemoved] = useState<TaskAttachment[]>([])
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const keptAttachments = initialAttachments.filter((a) => !removed.some((r) => r.id === a.id))

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const found: FieldErrors = {}
    if (!title.trim()) found.title = 'Title is required'
    if (!assignedTo) found.assignee = 'Assignee is required'
    setErrors(found)
    if (Object.keys(found).length > 0) return

    const values: NewTask = {
      projectId: projectId || null, // '' from the select = no project
      title: title.trim(),
      assignedTo,
      explanation: explanation.trim() ? explanation : null,
      deadline: deadline || null, // empty date input = no deadline
    }

    setSubmitError(null)
    setSaving(true)
    try {
      const attachments = await Promise.all(newFiles.map((file) => prepareAttachment(file)))
      const result = initial
        ? await updateTask.mutateAsync({
            id: initial.id,
            patch: values,
            removeAttachments: removed,
            newAttachments: attachments,
            startPosition: Math.max(-1, ...initialAttachments.map((a) => a.position)) + 1,
          })
        : await createTask.mutateAsync({ input: values, attachments })

      if (result.failedUploads > 0) {
        // The task is saved; send them to it so the warning sits next to what's missing.
        navigate(`/tasks/${result.task.id}`, { replace: true, state: { failedUploads: result.failedUploads } })
      } else {
        navigate(fromProject ? `/projects/${fromProject}` : '/tasks', { replace: true })
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not save the task')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mx-auto max-w-2xl space-y-6">
      <h1 className={ui.pageTitle}>{initial ? 'Edit task' : 'Assign task'}</h1>

      <div className={`${ui.card} space-y-5 p-5 sm:p-6`}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={ui.label}>
            Project (optional)
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={ui.input}>
              <option value="">No project</option>
              {projects.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label className={ui.label}>
            Assignee
            <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className={ui.input}>
              <option value="">Choose…</option>
              {profiles.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
            </select>
            {errors.assignee && <span className={ui.fieldError}>{errors.assignee}</span>}
          </label>
        </div>

        <label className={ui.label}>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={ui.input} />
          {errors.title && <span className={ui.fieldError}>{errors.title}</span>}
        </label>

        <div>
          <label className={ui.label}>
            Explanation
            <textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              rows={5}
              aria-describedby="explanation-hint"
              className={ui.input}
            />
          </label>
          <p id="explanation-hint" className="mt-1 text-xs text-fg-subtle">
            Markdown supported: **bold**, - lists, [links](url), `code`
          </p>
        </div>

        <label className={`${ui.label} sm:w-1/2`}>
          Deadline (optional)
          <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={ui.input} />
        </label>

        <div className="space-y-2">
          <p className="text-sm font-medium text-fg">Attachments (optional)</p>
          {keptAttachments.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {keptAttachments.map((attachment) => (
                <li key={attachment.id} className="relative">
                  {isImage(attachment.mimeType) ? (
                    <img
                      src={attachment.url}
                      alt={attachment.fileName}
                      className="h-20 w-20 rounded-lg object-cover ring-1 ring-line"
                    />
                  ) : (
                    <FileChip name={attachment.fileName} size={attachment.sizeBytes} />
                  )}
                  {/* The assignee's proof of work can only be removed by them or the lead. */}
                  {initial && me && canRemoveTaskAttachment(me, initial, attachment) && (
                    <RemoveBadge
                      label={`Remove saved ${attachment.fileName}`}
                      onClick={() => setRemoved((current) => [...current, attachment])}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
          <AttachmentInput value={newFiles} onChange={setNewFiles} existingCount={keptAttachments.length} />
        </div>
      </div>

      {submitError && <ErrorState error={new Error(submitError)} />}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="submit" disabled={saving} className={ui.btnPrimary}>
          {saving ? 'Saving…' : 'Save task'}
        </button>
        <button type="button" onClick={() => navigate(-1)} className={ui.btnSecondary}>
          Cancel
        </button>
      </div>
    </form>
  )
}
