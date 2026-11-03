import { useId } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { LoadingState } from '../../components/LoadingState'
import { StatusBadge } from '../../components/StatusBadge'
import { statusEdge, ui } from '../../components/ui'
import type { Comment, Finding, ItemRef, Task } from '../../data/types'
import { useUnseen } from '../items/queries'
import { nameOf } from '../team/queries'
import { useInbox, useLatestInboxComments } from './queries'

/** "Your turn" (spec §9): what needs you, and what you handed to someone else and are waiting on. */
export function InboxPage() {
  const { inbox, isPending, error, profiles, projects } = useInbox()

  const all = inbox ? [inbox.needsYou, inbox.waitingOnOthers] : []
  const latest = useLatestInboxComments(
    all.flatMap((s) => s.findings.map((f) => f.id)),
    all.flatMap((s) => s.tasks.map((t) => t.id)),
  )

  if (error) return <ErrorState error={error} />
  if (isPending || !inbox) return <LoadingState />

  const ctx: RowContext = {
    personName: (id) => nameOf(profiles, id),
    projectName: (id) => projects?.find((p) => p.id === id)?.name,
    latest: latest.data ?? {},
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className={ui.pageTitle}>Your turn</h1>
        <p className="mt-1 text-sm text-fg-muted">What needs you, and what you are waiting on someone else for.</p>
      </div>
      <Section title="Needs you" empty="Nothing needs you right now." items={inbox.needsYou} {...ctx} />
      <Section title="Waiting on others" empty="Nothing waiting on others." items={inbox.waitingOnOthers} {...ctx} />
    </div>
  )
}

interface RowContext {
  personName: (id: string) => string
  projectName: (id: string | null) => string | undefined
  latest: Record<string, Comment>
}

interface SectionProps extends RowContext {
  title: string
  empty: string
  items: { findings: Finding[]; tasks: Task[] }
}

function Section({ title, empty, items, ...ctx }: SectionProps) {
  const headingId = useId()
  const total = items.findings.length + items.tasks.length

  return (
    <section aria-labelledby={headingId} className="space-y-4">
      <h2 id={headingId} className="flex items-center gap-2 text-lg font-semibold">
        {title}
        <span aria-hidden="true" className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-fg-muted">
          {total}
        </span>
      </h2>
      {total === 0 ? (
        <EmptyState message={empty} />
      ) : (
        <>
          <Group label="Findings">
            {items.findings.map((f) => (
              <Row
                key={f.id}
                item={{ type: 'finding', id: f.id }}
                href={`/findings/${f.id}`}
                title={f.title}
                status={f.status}
                projectId={f.projectId}
                {...ctx}
              />
            ))}
          </Group>
          <Group label="Tasks">
            {items.tasks.map((t) => (
              <Row
                key={t.id}
                item={{ type: 'task', id: t.id }}
                href={`/tasks/${t.id}`}
                title={t.title}
                status={t.status}
                projectId={t.projectId}
                blockedReason={t.status === 'blocked' ? t.blockedReason : null}
                {...ctx}
              />
            ))}
          </Group>
        </>
      )}
    </section>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode[] }) {
  if (children.length === 0) return null
  return (
    <div className="space-y-2">
      <h3 className={ui.sectionTitle}>{label}</h3>
      <ul className={`${ui.card} divide-y divide-line overflow-hidden`}>{children}</ul>
    </div>
  )
}

interface RowProps extends RowContext {
  item: ItemRef
  href: string
  title: string
  status: Finding['status'] | Task['status']
  projectId: string | null
  blockedReason?: string | null
}

function Row({ item, href, title, status, projectId, blockedReason, personName, projectName, latest }: RowProps) {
  const { isUnseen } = useUnseen()
  const comment = latest[item.id]
  const project = projectName(projectId)

  return (
    <li className={statusEdge(status)}>
      <Link to={href} className="block px-4 py-3 transition-colors hover:bg-surface-2">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <StatusBadge status={status} />
          <span className="min-w-0 flex-1 font-medium text-fg">{title}</span>
          {isUnseen(item) && (
            <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-xs font-semibold text-accent-fg">NEW</span>
          )}
        </span>
        {project && <span className="mt-1 block text-xs text-fg-muted">{project}</span>}
        {blockedReason && <span className="mt-1 block text-sm text-overdue">Blocked: {blockedReason}</span>}
        {comment && (
          <span className="mt-2 line-clamp-2 border-l-2 border-line-strong pl-3 text-sm text-fg-muted">
            <span className="font-medium text-fg">{personName(comment.authorId)}:</span> {comment.body}
          </span>
        )}
      </Link>
    </li>
  )
}
