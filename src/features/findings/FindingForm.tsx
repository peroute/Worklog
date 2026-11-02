import { useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ErrorState } from '../../components/ErrorState'
import { LoadingState } from '../../components/LoadingState'
import { RemoveBadge } from '../../components/FileDropzone'
import { ui } from '../../components/ui'
import type { FindingDetail, FindingImage } from '../../data/types'
import { canEditContent } from '../../domain/permissions'
import { todayInTeamTz } from '../../lib/dates'
import { useMe } from '../auth/useMe'
import { useProjects } from '../projects/queries'
import { useTasks } from '../tasks/queries'
import { compressScreenshot } from './compress'
import { useCreateFinding, useFinding, useUpdateFinding } from './queries'
import { ScreenshotInput } from './ScreenshotInput'

/** Route element for /findings/new and /findings/:id/edit. */
export function FindingFormPage() {
  const { id } = useParams()
  if (!id) return <FindingForm />
  return <EditFinding id={id} />
}

function EditFinding({ id }: { id: string }) {
  const finding = useFinding(id)
  const { me } = useMe()
  if (finding.isPending || !me) return <LoadingState />
  if (finding.isError) return <ErrorState error={finding.error} />
  if (!canEditContent(me, finding.data.authorId)) {
    return <ErrorState error={new Error('Only the author or lead can edit this finding')} />
  }
  return <FindingForm initial={finding.data} />
}

interface FieldErrors {
  project?: string
  title?: string
  explanation?: string
}

function FindingForm({ initial }: { initial?: FindingDetail }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const projects = useProjects()
  const createFinding = useCreateFinding()
  const updateFinding = useUpdateFinding()

  const [projectId, setProjectId] = useState(initial?.projectId ?? searchParams.get('projectId') ?? '')
  const [taskId, setTaskId] = useState(initial?.taskId ?? '')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [explanation, setExplanation] = useState(initial?.explanation ?? '')
  const [findingDate, setFindingDate] = useState(initial?.findingDate ?? todayInTeamTz())
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [removed, setRemoved] = useState<FindingImage[]>([])
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const tasks = useTasks({ projectId }, { enabled: Boolean(projectId) })
  const keptImages = (initial?.images ?? []).filter((img) => !removed.some((r) => r.id === img.id))

  function validate(): FieldErrors {
    const found: FieldErrors = {}
    if (!projectId) found.project = 'Pick a project'
    if (!title.trim()) found.title = 'Title is required'
    if (!explanation.trim()) found.explanation = 'Explanation is required'
    return found
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const found = validate()
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setSubmitError(null)
    setSaving(true)
    try {
      const images = await Promise.all(newFiles.map((file) => compressScreenshot(file)))
      const values = { projectId, taskId: taskId || null, title: title.trim(), explanation, findingDate }

      const result = initial
        ? await updateFinding.mutateAsync({
            id: initial.id,
            patch: values,
            removeImages: removed,
            newImages: images,
            startPosition: Math.max(-1, ...initial.images.map((i) => i.position)) + 1,
          })
        : await createFinding.mutateAsync({ input: values, images })

      // The detail page shows the "failed to upload" warning next to the finding.
      navigate(`/findings/${result.finding.id}`, { replace: true, state: { failedUploads: result.failedUploads } })
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not save the finding')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mx-auto max-w-2xl space-y-6">
      <h1 className={ui.pageTitle}>{initial ? 'Edit finding' : 'Log finding'}</h1>

      <div className={`${ui.card} space-y-5 p-5 sm:p-6`}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={ui.label}>
            Project
            <select
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value)
                setTaskId('') // a task belongs to one project; don't keep a stale link
              }}
              className={ui.input}
            >
              <option value="">Choose…</option>
              {projects.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {errors.project && <span className={ui.fieldError}>{errors.project}</span>}
          </label>

          <label className={ui.label}>
            Linked task
            <select
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
              disabled={!projectId}
              className={ui.input}
            >
              <option value="">None</option>
              {tasks.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className={ui.label}>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={ui.input} />
          {errors.title && <span className={ui.fieldError}>{errors.title}</span>}
        </label>

        <label className={ui.label}>
          Explanation
          <textarea
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            rows={6}
            className={ui.input}
          />
          {errors.explanation && <span className={ui.fieldError}>{errors.explanation}</span>}
        </label>

        <label className={`${ui.label} sm:w-1/2`}>
          Date
          <input
            type="date"
            value={findingDate}
            onChange={(e) => setFindingDate(e.target.value)}
            className={ui.input}
          />
        </label>

        <div className="space-y-2">
          <p className="text-sm font-medium text-fg">Screenshots</p>
          {keptImages.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {keptImages.map((image, index) => (
                <li key={image.id} className="relative">
                  <img
                    src={image.url}
                    alt={`Saved screenshot ${index + 1}`}
                    className="h-20 w-20 rounded-lg object-cover ring-1 ring-line"
                  />
                  <RemoveBadge
                    label={`Remove saved screenshot ${index + 1}`}
                    onClick={() => setRemoved((current) => [...current, image])}
                  />
                </li>
              ))}
            </ul>
          )}
          <ScreenshotInput value={newFiles} onChange={setNewFiles} existingCount={keptImages.length} />
        </div>
      </div>

      {submitError && <ErrorState error={new Error(submitError)} />}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="submit" disabled={saving} className={ui.btnPrimary}>
          {saving ? 'Saving…' : 'Save finding'}
        </button>
        <button type="button" onClick={() => navigate(-1)} className={ui.btnSecondary}>
          Cancel
        </button>
      </div>
    </form>
  )
}
