import { useId } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { LoadingState } from '../../components/LoadingState'
import { StatusBadge } from '../../components/StatusBadge'
import { statusEdge, ui } from '../../components/ui'
import type { Comment, Finding, Task } from '../../data/types'
import { reviewQueues } from '../../domain/review'
import { useMe } from '../auth/useMe'
import { useFindings } from '../findings/queries'
import { useProjects } from '../projects/queries'
import { useTasks } from '../tasks/queries'
import { nameOf, useProfiles } from '../team/queries'
import { useLatestReviewComments } from './queries'

/** The review inbox: the lead sees what waits for them; members see what they must fix. */
export function ReviewPage() {
  const { me } = useMe()
  const findings = useFindings({})
  const tasks = useTasks({})
  const profiles = useProfiles()
  const projects = useProjects()

  const inLoop = (s: string) => s === 'needs_review' || s === 'fixed'
  const latest = useLatestReviewComments(
    (findings.data ?? []).filter((f) => inLoop(f.status)).map((f) => f.id),
    (tasks.data ?? []).filter((t) => inLoop(t.status)).map((t) => t.id),
  )

  if (!me || findings.isPending || tasks.isPending) return <LoadingState />
  if (findings.isError) return <ErrorState error={findings.error} />
  if (tasks.isError) return <ErrorState error={tasks.error} />

  const queues = reviewQueues(me, findings.data, tasks.data)
  const ctx = {
    personName: (id: string) => nameOf(profiles.data, id),
    projectName: (id: string | null) => projects.data?.find((p) => p.id === id)?.name,
    latest: latest.data ?? {},
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className={ui.pageTitle}>Review</h1>
        <p className="mt-1 text-sm text-fg-muted">
          {queues.kind === 'lead'
            ? 'Findings and tasks waiting for your review.'
            : 'Work the lead sent back to you, and work waiting on the lead.'}
        </p>
      </div>

      {queues.kind === 'lead' ? (
        <Queue title="Waiting for you" empty="Nothing waiting for you." items={queues.waiting} {...ctx} />
      ) : (
        <>
          <Queue title="Needs your fix" empty="Nothing to fix. 🎉" items={queues.toFix} {...ctx} />
          <Queue title="Waiting for the lead" empty="Nothing waiting on the lead." items={queues.waitingOnLead} {...ctx} />
        </>
      )}
    </div>
  )
}

interface QueueProps {
  title: string
  empty: string
  items: { findings: Finding[]; tasks: Task[] }
  personName: (id: string) => string
  projectName: (id: string | null) => string | undefined
  latest: Record<string, Comment>
}

function Queue({ title, empty, items, personName, projectName, latest }: QueueProps) {
  const headingId = useId()
  const rows = [
    ...items.findings.map((f) => ({ kind: 'Finding', id: f.id, href: `/findings/${f.id}`, title: f.title, status: f.status, person: f.authorId, projectId: f.projectId })),
    ...items.tasks.map((t) => ({ kind: 'Task', id: t.id, href: `/tasks/${t.id}`, title: t.title, status: t.status, person: t.assignedTo, projectId: t.projectId })),
  ]

  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <h2 id={headingId} className="flex items-center gap-2 text-lg font-semibold">
        {title}
        <span aria-hidden="true" className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-fg-muted">
          {rows.length}
        </span>
      </h2>
      {rows.length === 0 ? (
        <EmptyState message={empty} />
      ) : (
        <ul className={`${ui.card} divide-y divide-line overflow-hidden`}>
          {rows.map((row) => {
            const comment = latest[row.id]
            return (
              <li key={row.id} className={statusEdge(row.status)}>
                <Link to={row.href} className="block px-4 py-3 transition-colors hover:bg-surface-2">
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className={ui.tag}>{row.kind}</span>
                    <span className="min-w-0 flex-1 font-medium text-fg">{row.title}</span>
                    <StatusBadge status={row.status} />
                  </span>
                  <span className="mt-1 block text-xs text-fg-muted">
                    {personName(row.person)}
                    {projectName(row.projectId) && <> · {projectName(row.projectId)}</>}
                  </span>
                  {comment && (
                    <span className="mt-2 line-clamp-2 border-l-2 border-line-strong pl-3 text-sm text-fg-muted">
                      {/* One inline run so the 2-line clamp keeps "Name:" beside the text. */}
                      <span className="font-medium text-fg">{personName(comment.authorId)}:</span> {comment.body}
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
