import { useId } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '../../components/Avatar'
import { StatusBadge } from '../../components/StatusBadge'
import { statusEdge, ui } from '../../components/ui'
import type { Finding, Profile, Task } from '../../data/types'
import { bucketTasks } from '../../domain/bucketTasks'
import { NewDot } from '../items/NewDot'
import { TaskRow } from '../tasks/TaskRow'

interface PersonColumnProps {
  person: Profile
  tasks: Task[]
  /** That day's findings for everyone; the column keeps this person's. */
  findings: Finding[]
  viewedDate: string
  isToday: boolean
  me: Profile | undefined
  projectName: (id: string | null) => string | undefined
  personName: (id: string) => string | undefined
}

/** One person's day: their task groups, then the findings they logged. */
export function PersonColumn({
  person,
  tasks,
  findings,
  viewedDate,
  isToday,
  me,
  projectName,
  personName,
}: PersonColumnProps) {
  const headingId = useId()
  const buckets = bucketTasks(tasks, person.id, viewedDate)
  const mine = findings.filter((f) => f.authorId === person.id)
  const open = buckets.blocked.length + buckets.dueOrOverdue.length + buckets.upcoming.length + buckets.noDeadline.length

  const groups: [string, Task[]][] = [
    // Blocked work comes first: somebody has to unblock it.
    ['Blocked', buckets.blocked],
    ['Due / Overdue', buckets.dueOrOverdue],
    ['Upcoming', buckets.upcoming],
    ['No deadline', buckets.noDeadline],
    ['Completed', buckets.completed],
  ]
  const nothing = open === 0 && buckets.completed.length === 0 && mine.length === 0

  return (
    <section aria-labelledby={headingId} className={`${ui.card} flex flex-col overflow-hidden`}>
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <Avatar id={person.id} name={person.displayName} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="truncate text-base font-semibold text-fg">
            {person.displayName}
          </h2>
          <p className="text-xs text-fg-muted">
            {isToday ? 'done today' : 'done'} {buckets.completed.length} · open {open}
          </p>
        </div>
      </header>

      {nothing && <p className="px-4 py-8 text-center text-sm text-fg-subtle">Nothing logged yet.</p>}

      {groups
        .filter(([, items]) => items.length > 0)
        .map(([label, items]) => (
          <div key={label} className="border-b border-line last:border-b-0">
            <h3 className={`${ui.sectionTitle} px-4 pt-3 pb-1 ${label === 'Blocked' ? 'text-overdue' : ''}`}>
              {label}
            </h3>
            <ul className="divide-y divide-line">
              {items.map((task) => (
                <li key={task.id}>
                  <TaskRow
                    task={task}
                    creatorName={task.createdBy === task.assignedTo ? undefined : personName(task.createdBy)}
                    projectName={projectName(task.projectId)}
                    me={me}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}

      {mine.length > 0 && (
        <div className="bg-surface-2/40 px-4 py-3">
          <h3 className={ui.sectionTitle}>Findings</h3>
          <ul className="mt-2 space-y-1.5">
            {mine.map((finding) => (
              <li key={finding.id}>
                <Link
                  to={`/findings/${finding.id}`}
                  className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm transition-colors hover:border-accent ${statusEdge(
                    finding.status,
                  )}`}
                >
                  <NewDot item={{ type: 'finding', id: finding.id }} />
                  <span className={ui.tag}>{projectName(finding.projectId)}</span>
                  <span className="min-w-0 flex-1 font-medium text-fg">{finding.title}</span>
                  {finding.imageCount > 0 && <span className="text-xs text-fg-muted">📷 {finding.imageCount}</span>}
                  <StatusBadge status={finding.status} />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
