import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { LoadingState } from '../../components/LoadingState'
import { ProjectForm } from './ProjectForm'
import { useCreateProject, useProjects } from './queries'

const plural = (n: number, word: string) => `${n} open ${word}${n === 1 ? '' : 's'}`

export function ProjectsPage() {
  const projects = useProjects()
  const createProject = useCreateProject()
  const [creating, setCreating] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Projects</h1>
        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white"
          >
            + New project
          </button>
        )}
      </div>

      {creating && (
        <ProjectForm
          submitLabel="Create project"
          onSubmit={async (values) => {
            await createProject.mutateAsync(values)
            setCreating(false)
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      {projects.isPending && <LoadingState />}
      {projects.isError && <ErrorState error={projects.error} />}
      {projects.data?.length === 0 && !creating && <EmptyState message="No projects yet — create the first one." />}

      <ul className="grid gap-3 sm:grid-cols-2">
        {projects.data?.map((project) => (
          <li key={project.id}>
            <Link to={`/projects/${project.id}`} className="block rounded-lg border bg-white p-4 hover:border-blue-400">
              <p className="font-medium">{project.name}</p>
              {project.description && <p className="mt-1 text-sm text-gray-600">{project.description}</p>}
              <p className="mt-2 text-xs text-gray-500">
                {plural(project.openFindings, 'finding')} · {plural(project.openTasks, 'task')}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
