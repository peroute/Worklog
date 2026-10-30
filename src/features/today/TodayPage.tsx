import { Link, useSearchParams } from 'react-router-dom'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { LoadingState } from '../../components/LoadingState'
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-label="Previous day"
          onClick={() => goTo(addDays(viewedDate, -1))}
          className="rounded px-2 py-1 text-lg hover:bg-gray-100"
        >
          ‹
        </button>
        <h1 className="text-xl font-semibold">
          {isToday && <span className="mr-2 text-blue-600">Today ·</span>}
          {formatDayHeading(viewedDate)}
        </h1>
        <button
          type="button"
          aria-label="Next day"
          onClick={() => goTo(addDays(viewedDate, 1))}
          className="rounded px-2 py-1 text-lg hover:bg-gray-100"
        >
          ›
        </button>
        <label className="ml-2 text-sm">
          <span className="sr-only">Pick a date</span>
          <input
            type="date"
            value={viewedDate}
            onChange={(e) => e.target.value && goTo(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </label>
        {!isToday && (
          <button type="button" onClick={() => goTo(today)} className="rounded px-3 py-1 text-sm text-blue-600 hover:bg-blue-50">
            Back to today
          </button>
        )}
        <div className="ml-auto flex gap-2">
          <Link to="/findings/new" className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white">
            + Log finding
          </Link>
          <Link to="/tasks/new" className="rounded border px-3 py-1.5 text-sm font-medium hover:bg-gray-50">
            + Assign task
          </Link>
        </div>
      </div>

      {day.isPending && <LoadingState />}
      {day.isError && <ErrorState error={day.error} />}

      {day.data && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {todayColumns(day.data.profiles, day.data.tasks, day.data.findings, viewedDate).map((person) => (
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

          <section aria-label="Projects" className="space-y-2">
            <p className="text-xs font-medium tracking-wide text-gray-500 uppercase">Projects</p>
            {day.data.projects.length === 0 ? (
              <EmptyState
                message="No projects yet — create the first one."
                action={
                  <Link to="/projects" className="text-blue-600 hover:underline">
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
                      className="block rounded-full border bg-white px-3 py-1 text-sm hover:border-blue-400"
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
