import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { LoadingState } from '../../components/LoadingState'
import { StatusBadge } from '../../components/StatusBadge'
import type { FindingStatus, TaskStatus } from '../../data/types'
import { groupFindingsByDate } from '../../domain/groupFindings'
import { canDeleteProject } from '../../domain/permissions'
import { formatDayHeading } from '../../lib/dates'
import { useMe } from '../auth/useMe'
import { useFindings } from '../findings/queries'
import { useTasks } from '../tasks/queries'
import { nameOf, useProfiles } from '../team/queries'
import { DeleteProjectDialog } from './DeleteProjectDialog'
import { ProjectForm } from './ProjectForm'
import { useProject, useUpdateProject } from './queries'

const selectClass = 'rounded border border-gray-300 px-2 py-1 text-sm'

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

  if (project.isPending) return <LoadingState />
  if (project.isError) return <ErrorState error={project.error} />

  return (
    <div className="space-y-6">
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
        <header className="flex items-start justify-between gap-4">
          <div>
            <Link to="/projects" className="text-sm text-blue-600 hover:underline">
              ← Projects
            </Link>
            <h1 className="text-xl font-semibold">{project.data.name}</h1>
            {project.data.description && <p className="text-sm text-gray-600">{project.data.description}</p>}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditing(true)} className="rounded px-3 py-1.5 text-sm hover:bg-gray-100">
              Edit
            </button>
            {me && canDeleteProject(me) && (
              <button
                type="button"
                onClick={() => setDeleting(true)}
                className="rounded px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
              >
                Delete project
              </button>
            )}
          </div>
        </header>
      )}

      <section aria-labelledby="tasks-heading" className="space-y-2">
        <div className="flex items-center gap-3">
          <h2 id="tasks-heading" className="font-semibold">
            Tasks
          </h2>
          <label className="text-sm text-gray-600">
            <span className="sr-only">Task status</span>
            <select value={taskStatus} onChange={(e) => setTaskStatus(e.target.value as TaskStatus | 'all')} className={selectClass}>
              <option value="all">All</option>
              <option value="todo">To do</option>
              <option value="done">Done</option>
            </select>
          </label>
          <Link to={`/tasks/new?projectId=${id}`} className="ml-auto text-sm text-blue-600 hover:underline">
            + Assign task
          </Link>
        </div>
        {tasks.isError && <ErrorState error={tasks.error} />}
        {tasks.data && visibleTasks.length === 0 && <EmptyState message="No tasks here." />}
        <ul className="divide-y rounded-lg border bg-white">
          {visibleTasks.map((task) => (
            <li key={task.id} className="flex items-center gap-3 px-4 py-2 text-sm">
              <span className="flex-1">{task.title}</span>
              <span className="text-gray-600">{nameOf(profiles.data, task.assignedTo)}</span>
              {task.deadline && <span className="text-gray-500">{formatDayHeading(task.deadline)}</span>}
              <StatusBadge status={task.status} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="findings-heading" className="space-y-2">
        <div className="flex items-center gap-3">
          <h2 id="findings-heading" className="font-semibold">
            Findings
          </h2>
          <label className="text-sm text-gray-600">
            <span className="sr-only">Person</span>
            <select value={person} onChange={(e) => setPerson(e.target.value)} className={selectClass}>
              <option value="all">Everyone</option>
              {profiles.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-gray-600">
            <span className="sr-only">Finding status</span>
            <select
              value={findingStatus}
              onChange={(e) => setFindingStatus(e.target.value as FindingStatus | 'all')}
              className={selectClass}
            >
              <option value="all">Open + closed</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </select>
          </label>
          <Link to={`/findings/new?projectId=${id}`} className="ml-auto text-sm text-blue-600 hover:underline">
            + Log finding
          </Link>
        </div>
        {findings.isError && <ErrorState error={findings.error} />}
        {findings.data && dayGroups.length === 0 && <EmptyState message="No findings match." />}
        {dayGroups.map((group) => (
          <div key={group.date}>
            <h3 className="mt-3 mb-1 text-sm font-medium text-gray-500">{formatDayHeading(group.date)}</h3>
            <ul className="divide-y rounded-lg border bg-white">
              {group.findings.map((finding) => (
                <li key={finding.id}>
                  <Link to={`/findings/${finding.id}`} className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-50">
                    <span className="w-20 text-gray-600">{nameOf(profiles.data, finding.authorId)}</span>
                    <span className="flex-1">{finding.title}</span>
                    {finding.imageCount > 0 && <span className="text-gray-500">📷 {finding.imageCount}</span>}
                    <StatusBadge status={finding.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
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
