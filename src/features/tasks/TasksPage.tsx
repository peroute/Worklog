import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { LoadingState } from '../../components/LoadingState'
import { ui } from '../../components/ui'
import type { TaskStatus } from '../../data/types'
import { useMe } from '../auth/useMe'
import { useProjects } from '../projects/queries'
import { nameOf, useProfiles } from '../team/queries'
import { useTasks } from './queries'
import { TaskRow } from './TaskRow'

/** All tasks across projects. Defaults to open tasks (what still needs doing). */
export function TasksPage() {
  const { me } = useMe()
  const tasks = useTasks()
  const profiles = useProfiles()
  const projects = useProjects()

  const [assignee, setAssignee] = useState('all')
  const [status, setStatus] = useState<TaskStatus | 'all'>('todo')
  const [projectId, setProjectId] = useState('all')

  const visible = (tasks.data ?? []).filter(
    (t) =>
      (assignee === 'all' || t.assignedTo === assignee) &&
      (status === 'all' || t.status === status) &&
      (projectId === 'all' || t.projectId === projectId),
  )
  const projectName = (id: string) => projects.data?.find((p) => p.id === id)?.name

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className={ui.pageTitle}>Tasks</h1>
          <p className="mt-1 text-sm text-fg-muted">Everything assigned, across projects.</p>
        </div>
        <Link to="/tasks/new" className={ui.btnPrimary}>
          + Assign task
        </Link>
      </div>

      <div className={`${ui.card} grid gap-3 p-4 text-xs font-medium text-fg-muted sm:grid-cols-3`}>
        <label>
          Assignee
          <select
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            className={`${ui.select} mt-1 block w-full`}
          >
            <option value="all">Everyone</option>
            {profiles.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as TaskStatus | 'all')}
            className={`${ui.select} mt-1 block w-full`}
          >
            <option value="todo">To do</option>
            <option value="done">Done (waiting for lead)</option>
            <option value="needs_review">Needs review</option>
            <option value="fixed">Fixed</option>
            <option value="approved">Approved</option>
            <option value="all">All</option>
          </select>
        </label>
        <label>
          Project
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className={`${ui.select} mt-1 block w-full`}
          >
            <option value="all">All projects</option>
            {projects.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {tasks.isPending && <LoadingState />}
      {tasks.isError && <ErrorState error={tasks.error} />}
      {tasks.data && visible.length === 0 && <EmptyState message="No tasks match these filters." />}
      {visible.length > 0 && (
        <ul className={`${ui.card} divide-y divide-line overflow-hidden`}>
          {visible.map((task) => (
            <li key={task.id}>
              <TaskRow
                task={task}
                assigneeName={nameOf(profiles.data, task.assignedTo)}
                projectName={projectName(task.projectId)}
                me={me}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
