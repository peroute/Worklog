import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { LoadingState } from '../../components/LoadingState'
import { ui } from '../../components/ui'
import { ProjectForm } from './ProjectForm'
import { useCreateProject, useProjects } from './queries'

const plural = (n: number, word: string) => `${n} open ${word}${n === 1 ? '' : 's'}`

export function ProjectsPage() {
  const projects = useProjects()
  const createProject = useCreateProject()
  const [creating, setCreating] = useState(false)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className={ui.pageTitle}>Projects</h1>
          <p className="mt-1 text-sm text-fg-muted">Findings and tasks, organised by what you're working on.</p>
        </div>
        {!creating && (
          <button type="button" onClick={() => setCreating(true)} className={ui.btnPrimary}>
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

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.data?.map((project) => (
          <li key={project.id}>
            <Link
              to={`/projects/${project.id}`}
              className={`${ui.card} group flex h-full flex-col p-5 transition hover:-translate-y-0.5 hover:border-accent`}
            >
              <p className="font-semibold text-fg group-hover:text-accent-fg">{project.name}</p>
              {project.description ? (
                <p className="mt-1 line-clamp-2 text-sm text-fg-muted">{project.description}</p>
              ) : (
                <p className="mt-1 text-sm text-fg-subtle italic">No description</p>
              )}
              <div className="mt-auto flex flex-wrap gap-2 pt-4 text-xs font-medium">
                <span
                  className={`rounded-full px-2.5 py-1 ring-1 ring-inset ${
                    project.openFindings > 0
                      ? 'bg-open-soft text-open ring-open-edge/40'
                      : 'bg-surface-2 text-fg-muted ring-line'
                  }`}
                >
                  {plural(project.openFindings, 'finding')}
                </span>
                <span className="rounded-full bg-surface-2 px-2.5 py-1 text-fg-muted ring-1 ring-line ring-inset">
                  {plural(project.openTasks, 'task')}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
