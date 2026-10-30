import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { LoadingState } from '../../components/LoadingState'
import type { TaskStatus } from '../../data/types'
import { useMe } from '../auth/useMe'
import { useProjects } from '../projects/queries'
import { nameOf, useProfiles } from '../team/queries'
import { useTasks } from './queries'
import { TaskRow } from './TaskRow'

const selectClass = 'mt-1 block rounded border border-gray-300 px-2 py-1 text-sm'

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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Tasks</h1>
        <Link to="/tasks/new" className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white">
          + Assign task
        </Link>
      </div>

      <div className="flex flex-wrap gap-4 text-sm text-gray-600">
        <label>
          Assignee
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={selectClass}>
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
          <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus | 'all')} className={selectClass}>
            <option value="todo">To do</option>
            <option value="done">Done</option>
            <option value="all">All</option>
          </select>
        </label>
        <label>
          Project
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={selectClass}>
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
        <ul className="divide-y rounded-lg border bg-white">
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
