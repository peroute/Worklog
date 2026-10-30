import { Link, useSearchParams } from 'react-router-dom'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { LoadingState } from '../../components/LoadingState'
import { ui } from '../../components/ui'
import { daySummary } from '../../domain/daySummary'
import { todayColumns } from '../../domain/todayColumns'
import { addDays, formatDayHeading, todayInTeamTz } from '../../lib/dates'
import { useMe } from '../auth/useMe'
import { PersonColumn } from './PersonColumn'
import { useToday } from './queries'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Home screen (spec §7.2): what each person has on and found, for one day. */
export function TodayPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const today = todayInTeamTz()
  // The viewed day lives in the URL so refresh, back/forward and shared links keep it.
  const param = searchParams.get('date')
  const viewedDate = param && ISO_DATE.test(param) ? param : today
  const isToday = viewedDate === today

  const { me } = useMe()
  const day = useToday(viewedDate)

  function goTo(date: string) {
    setSearchParams(date === today ? {} : { date })
  }

  const projectName = (id: string) => day.data?.projects.find((p) => p.id === id)?.name
  const columns = day.data ? todayColumns(day.data.profiles, day.data.tasks, day.data.findings, viewedDate) : []
  const summary = day.data ? daySummary(day.data.tasks, day.data.findings, viewedDate) : null

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {/* Day switcher: ‹ date › as one control. */}
          <div className="flex items-center rounded-xl border border-line bg-surface p-1 shadow-sm dark:shadow-none">
            <button
              type="button"
              aria-label="Previous day"
              onClick={() => goTo(addDays(viewedDate, -1))}
              className={ui.iconBtn}
            >
              ‹
            </button>
            <h1 className="px-2 text-lg font-semibold tracking-tight whitespace-nowrap sm:text-xl">
              {isToday && <span className="mr-1.5 text-accent-fg">Today ·</span>}
              {formatDayHeading(viewedDate)}
            </h1>
            <button
              type="button"
              aria-label="Next day"
              onClick={() => goTo(addDays(viewedDate, 1))}
              className={ui.iconBtn}
            >
              ›
            </button>
          </div>
          <label>
            <span className="sr-only">Pick a date</span>
            <input
              type="date"
              value={viewedDate}
              onChange={(e) => e.target.value && goTo(e.target.value)}
              className={`${ui.select} py-2`}
            />
          </label>
          {!isToday && (
            <button type="button" onClick={() => goTo(today)} className={`${ui.btnGhost} text-accent-fg`}>
              Back to today
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Link to="/findings/new" className={ui.btnPrimary}>
            + Log finding
          </Link>
          <Link to="/tasks/new" className={ui.btnSecondary}>
            + Assign task
          </Link>
        </div>
      </div>

      {day.isPending && <LoadingState />}
      {day.isError && <ErrorState error={day.error} />}

      {day.data && summary && (
        <>
          {/* Team totals for the morning scan. Colors match the item edges below. */}
          <section aria-label="Day summary" className="grid grid-cols-3 gap-2 sm:gap-4">
            {[
              { label: 'Open findings', value: summary.openFindings, color: 'text-open', bar: 'bg-open-edge' },
              { label: 'Overdue', value: summary.overdue, color: 'text-overdue', bar: 'bg-overdue-edge' },
              { label: isToday ? 'Done today' : 'Done', value: summary.done, color: 'text-done', bar: 'bg-done-edge' },
            ].map((tile) => (
              <div key={tile.label} className={`${ui.card} relative overflow-hidden px-3 py-3 sm:px-5 sm:py-4`}>
                <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-0.5 ${tile.bar}`} />
                <p
                  className={`text-2xl font-bold tabular-nums sm:text-3xl ${tile.value > 0 ? tile.color : 'text-fg-subtle'}`}
                >
                  {tile.value}
                </p>
                <p className="mt-0.5 text-xs font-medium text-fg-muted sm:text-sm">{tile.label}</p>
              </div>
            ))}
          </section>

          {/* Stacks on phones; column count follows the number of people so none is left empty. */}
          <div
            className={`grid items-start gap-4 ${
              columns.length >= 3 ? 'md:grid-cols-2 xl:grid-cols-3' : columns.length === 2 ? 'md:grid-cols-2' : ''
            }`}
          >
            {columns.map((person) => (
              <PersonColumn
                key={person.id}
                person={person}
                tasks={day.data.tasks}
                findings={day.data.findings}
                viewedDate={viewedDate}
                isToday={isToday}
                me={me}
                projectName={projectName}
              />
            ))}
          </div>

          <section aria-label="Projects" className="space-y-3">
            <p className={ui.sectionTitle}>Projects</p>
            {day.data.projects.length === 0 ? (
              <EmptyState
                message="No projects yet — create the first one."
                action={
                  <Link to="/projects" className={ui.link}>
                    Go to Projects
                  </Link>
                }
              />
            ) : (
              <ul className="flex flex-wrap gap-2">
                {day.data.projects.map((project) => (
                  <li key={project.id}>
                    <Link
                      to={`/projects/${project.id}`}
                      className="inline-flex items-center rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-medium text-fg transition-colors hover:border-accent hover:text-accent-fg"
                    >
                      {project.name} · {project.openFindings} open
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
