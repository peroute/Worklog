import { useId } from 'react'
import { Link } from 'react-router-dom'
import { StatusBadge } from '../../components/StatusBadge'
import type { Finding, Profile, Task } from '../../data/types'
import { bucketTasks } from '../../domain/bucketTasks'
import { TaskRow } from '../tasks/TaskRow'

interface PersonColumnProps {
  person: Profile
  tasks: Task[]
  /** That day's findings for everyone; the column keeps this person's. */
  findings: Finding[]
  viewedDate: string
  isToday: boolean
  me: Profile | undefined
  projectName: (id: string) => string | undefined
}

/** One person's day: their task groups, then the findings they logged. */
export function PersonColumn({ person, tasks, findings, viewedDate, isToday, me, projectName }: PersonColumnProps) {
  const headingId = useId()
  const buckets = bucketTasks(tasks, person.id, viewedDate)
  const mine = findings.filter((f) => f.authorId === person.id)
  const open = buckets.dueOrOverdue.length + buckets.upcoming.length + buckets.noDeadline.length

  const groups: [string, Task[]][] = [
    ['Due / Overdue', buckets.dueOrOverdue],
    ['Upcoming', buckets.upcoming],
    ['No deadline', buckets.noDeadline],
    ['Completed', buckets.completed],
  ]
  const nothing = open === 0 && buckets.completed.length === 0 && mine.length === 0

  return (
    <section aria-labelledby={headingId} className="space-y-3 rounded-lg border bg-white p-4">
      <div>
        <h2 id={headingId} className="text-lg font-semibold">
          {person.displayName}
        </h2>
        <p className="text-xs text-gray-500">
          {isToday ? 'done today' : 'done'} {buckets.completed.length} · open {open}
        </p>
      </div>

      {nothing && <p className="text-sm text-gray-500">Nothing logged yet.</p>}

      {groups
        .filter(([, items]) => items.length > 0)
        .map(([label, items]) => (
          <div key={label}>
            <h3 className="text-xs font-medium tracking-wide text-gray-500 uppercase">{label}</h3>
            <ul className="-mx-4 divide-y">
              {items.map((task) => (
                <li key={task.id}>
                  <TaskRow task={task} projectName={projectName(task.projectId)} me={me} />
                </li>
              ))}
            </ul>
          </div>
        ))}

      {mine.length > 0 && (
        <div>
          <h3 className="text-xs font-medium tracking-wide text-gray-500 uppercase">Findings</h3>
          <ul className="mt-1 space-y-1">
            {mine.map((finding) => (
              <li key={finding.id}>
                <Link to={`/findings/${finding.id}`} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-gray-50">
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">{projectName(finding.projectId)}</span>
                  <span className="flex-1">{finding.title}</span>
                  {finding.imageCount > 0 && <span className="text-gray-500">📷 {finding.imageCount}</span>}
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
