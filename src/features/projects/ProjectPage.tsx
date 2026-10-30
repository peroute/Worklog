import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Avatar } from '../../components/Avatar'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { LoadingState } from '../../components/LoadingState'
import { StatusBadge } from '../../components/StatusBadge'
import { edge, ui } from '../../components/ui'
import type { FindingStatus, TaskStatus } from '../../data/types'
import { groupFindingsByDate } from '../../domain/groupFindings'
import { canDeleteProject } from '../../domain/permissions'
import { formatDayHeading } from '../../lib/dates'
import { useMe } from '../auth/useMe'
import { FindingDetails } from '../findings/FindingDetails'
import { useFindingImages, useFindings } from '../findings/queries'
import { useTasks } from '../tasks/queries'
import { TaskRow } from '../tasks/TaskRow'
import { nameOf, useProfiles } from '../team/queries'
import { DeleteProjectDialog } from './DeleteProjectDialog'
import { ProjectForm } from './ProjectForm'
import { useProject, useUpdateProject } from './queries'

// "Show details" is remembered per browser, like the theme.
const SHOW_DETAILS_KEY = 'worklog-show-finding-details'

function readShowDetails(): boolean {
  try {
    return localStorage.getItem(SHOW_DETAILS_KEY) === 'true'
  } catch {
    return false
  }
}

function saveShowDetails(value: boolean): void {
  try {
    localStorage.setItem(SHOW_DETAILS_KEY, String(value))
  } catch {
    // Storage blocked: the toggle still works for this visit.
  }
}

export function ProjectPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { me } = useMe()
  const project = useProject(id)
  const tasks = useTasks({ projectId: id })
  const findings = useFindings({ projectId: id })
  const profiles = useProfiles()
  const updateProject = useUpdateProject()

  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [taskStatus, setTaskStatus] = useState<TaskStatus | 'all'>('all')
  const [findingStatus, setFindingStatus] = useState<FindingStatus | 'all'>('all')
  const [person, setPerson] = useState<string>('all')
  const [showDetails, setShowDetails] = useState(readShowDetails)

  function toggleDetails() {
    const next = !showDetails
    setShowDetails(next)
    saveShowDetails(next)
  }

  // Filtering happens in the browser: one project's findings is a small list.
  const visibleTasks = (tasks.data ?? []).filter((t) => taskStatus === 'all' || t.status === taskStatus)
  const dayGroups = useMemo(
    () =>
      groupFindingsByDate(
        (findings.data ?? []).filter(
          (f) => (findingStatus === 'all' || f.status === findingStatus) && (person === 'all' || f.authorId === person),
        ),
      ),
    [findings.data, findingStatus, person],
  )
  // Screenshots load only when details are on, and only for findings that have any.
  const idsWithImages = dayGroups.flatMap((g) => g.findings.filter((f) => f.imageCount > 0).map((f) => f.id))
  const images = useFindingImages(idsWithImages, showDetails)

  if (project.isPending) return <LoadingState />
  if (project.isError) return <ErrorState error={project.error} />

  return (
    <div className="space-y-8">
      <Link to="/projects" className="text-sm font-medium text-fg-muted hover:text-fg">
        ← Projects
      </Link>

      {editing ? (
        <ProjectForm
          initial={{ name: project.data.name, description: project.data.description }}
          submitLabel="Save"
          onSubmit={async (patch) => {
            await updateProject.mutateAsync({ id, patch })
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className={ui.pageTitle}>{project.data.name}</h1>
            {project.data.description && <p className="mt-1 text-sm text-fg-muted">{project.data.description}</p>}
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => setEditing(true)} className={ui.btnSecondary}>
              Edit
            </button>
            {me && canDeleteProject(me) && (
              <button type="button" onClick={() => setDeleting(true)} className={ui.btnDangerGhost}>
                Delete project
              </button>
            )}
          </div>
        </header>
      )}

      <section aria-labelledby="tasks-heading" className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="tasks-heading" className="text-lg font-semibold">
            Tasks
          </h2>
          <label>
            <span className="sr-only">Task status</span>
            <select
              value={taskStatus}
              onChange={(e) => setTaskStatus(e.target.value as TaskStatus | 'all')}
              className={ui.select}
            >
              <option value="all">All</option>
              <option value="todo">To do</option>
              <option value="done">Done</option>
            </select>
          </label>
          <Link to={`/tasks/new?projectId=${id}`} className={`${ui.btnSecondary} ml-auto`}>
            + Assign task
          </Link>
        </div>
        {tasks.isError && <ErrorState error={tasks.error} />}
        {tasks.data && visibleTasks.length === 0 && <EmptyState message="No tasks here." />}
        {visibleTasks.length > 0 && (
          <ul className={`${ui.card} divide-y divide-line overflow-hidden`}>
            {visibleTasks.map((task) => (
              <li key={task.id}>
                <TaskRow task={task} assigneeName={nameOf(profiles.data, task.assignedTo)} me={me} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="findings-heading" className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="findings-heading" className="text-lg font-semibold">
            Findings
          </h2>
          <label>
            <span className="sr-only">Person</span>
            <select value={person} onChange={(e) => setPerson(e.target.value)} className={ui.select}>
              <option value="all">Everyone</option>
              {profiles.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Finding status</span>
            <select
              value={findingStatus}
              onChange={(e) => setFindingStatus(e.target.value as FindingStatus | 'all')}
              className={ui.select}
            >
              <option value="all">Open + closed</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </select>
          </label>
          <button
            type="button"
            aria-pressed={showDetails}
            onClick={toggleDetails}
            className={showDetails ? `${ui.btnSecondary} border-accent text-accent-fg` : ui.btnSecondary}
          >
            <span aria-hidden="true">{showDetails ? '▴' : '▾'}</span>
            {showDetails ? 'Hide details' : 'Show details'}
          </button>
          <Link to={`/findings/new?projectId=${id}`} className={`${ui.btnPrimary} ml-auto`}>
            + Log finding
          </Link>
        </div>
        {findings.isError && <ErrorState error={findings.error} />}
        {showDetails && images.isError && <ErrorState error={images.error} />}
        {findings.data && dayGroups.length === 0 && <EmptyState message="No findings match." />}

        <div className="space-y-5">
          {dayGroups.map((group) => (
            <div key={group.date}>
              <h3 className="mb-2 text-base font-semibold">{formatDayHeading(group.date)}</h3>
              <ul className={`${ui.card} divide-y divide-line overflow-hidden`}>
                {group.findings.map((finding) => {
                  const author = nameOf(profiles.data, finding.authorId)
                  return (
                    <li key={finding.id} className={finding.status === 'open' ? edge.open : edge.done}>
                      <Link
                        to={`/findings/${finding.id}`}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm transition hover:bg-surface-2"
                      >
                        <span className="flex items-center gap-2 text-fg-muted sm:w-28">
                          <Avatar id={finding.authorId} name={author} size="sm" />
                          {author}
                        </span>
                        <span className="min-w-0 flex-1 basis-full sm:basis-auto">
                          <span className={`font-semibold ${finding.status === 'open' ? 'text-fg' : 'text-fg-muted'}`}>
                            {finding.title}
                          </span>
                        </span>
                        {finding.imageCount > 0 && (
                          <span className="text-xs text-fg-muted">📷 {finding.imageCount}</span>
                        )}
                        <StatusBadge status={finding.status} />
                      </Link>
                      {showDetails && (
                        <FindingDetails
                          findingId={finding.id}
                          title={finding.title}
                          explanation={finding.explanation}
                          images={images.data?.[finding.id] ?? []}
                          loadingImages={finding.imageCount > 0 && images.isPending}
                        />
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <DeleteProjectDialog
        project={project.data}
        open={deleting}
        onClose={() => setDeleting(false)}
        onDeleted={() => navigate('/projects', { replace: true })}
      />
    </div>
  )
}
