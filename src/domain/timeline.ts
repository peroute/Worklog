import type { ActivityEntry, Comment, Profile } from '../data/types'
import { FINDING_STATUS_LABEL, TASK_STATUS_LABEL } from './actions'

export type TimelineEntry = (
  | { kind: 'comment'; comment: Comment }
  | { kind: 'activity'; entry: ActivityEntry }
) & { at: string; isNew: boolean }

/**
 * Comments and history lines in one list, oldest first. Rows written in one transaction share a
 * timestamp, so on a tie the comment goes first, then id keeps the order stable.
 * `isNew` = after `lastSeen` (or never seen) and not written by `me`; admin activity (no actor) counts as someone else.
 */
export function buildTimeline(
  comments: Comment[],
  activity: ActivityEntry[],
  me: Profile,
  lastSeen: string | null,
): TimelineEntry[] {
  const isNew = (at: string, who: string | null) => who !== me.id && (lastSeen === null || at > lastSeen)

  const all: TimelineEntry[] = [
    ...comments.map((comment): TimelineEntry => ({
      kind: 'comment',
      comment,
      at: comment.createdAt,
      isNew: isNew(comment.createdAt, comment.authorId),
    })),
    ...activity.map((entry): TimelineEntry => ({
      kind: 'activity',
      entry,
      at: entry.createdAt,
      isNew: isNew(entry.createdAt, entry.actorId),
    })),
  ]
  const idOf = (e: TimelineEntry) => (e.kind === 'comment' ? e.comment.id : e.entry.id)
  return all.sort((a, b) => {
    if (a.at !== b.at) return a.at < b.at ? -1 : 1
    if (a.kind !== b.kind) return a.kind === 'comment' ? -1 : 1
    return idOf(a).localeCompare(idOf(b))
  })
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** 'YYYY-MM-DD' → 'Nov 3'. Parsed as text so the viewer's timezone can't shift the day. */
function shortDate(value: unknown): string {
  const m = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null
  if (!m) return String(value)
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}`
}

const FIELD_NAME: Record<string, string> = {
  title: 'title',
  deadline: 'deadline',
  start_date: 'start date',
  assigned_to: 'assignee',
  project_id: 'project',
  needs_review: 'needs review',
  task_id: 'linked task',
  finding_date: 'date',
  name: 'name',
  explanation: 'explanation',
  submission_note: 'submission note',
  description: 'description',
}
const DATE_FIELDS = new Set(['deadline', 'start_date', 'finding_date'])
const TEXT_FIELDS = new Set(['title', 'name'])
// Ids that name something we don't have a lookup for here: say that it changed, not the raw uuid.
const OPAQUE_FIELDS = new Set(['project_id', 'task_id'])

function describeFieldChange(field: string, change: unknown, names: (id: string) => string): string {
  const label = FIELD_NAME[field] ?? field.replace(/_/g, ' ')
  if (change === null || typeof change !== 'object') return `edited the ${label}`

  const { from, to } = change as { from?: unknown; to?: unknown }
  if (field === 'needs_review') return `turned needs review ${to ? 'on' : 'off'}`
  if (OPAQUE_FIELDS.has(field)) return `changed the ${label}`

  const show = (v: unknown): string => {
    if (DATE_FIELDS.has(field)) return shortDate(v)
    if (field === 'assigned_to') return names(String(v))
    if (TEXT_FIELDS.has(field)) return `“${String(v)}”`
    return String(v)
  }
  if (from === null || from === undefined) return `set the ${label} to ${show(to)}`
  if (to === null || to === undefined) return `removed the ${label}`
  return `changed the ${label} from ${show(from)} to ${show(to)}`
}

const statusLabel = (s: unknown): string =>
  FINDING_STATUS_LABEL[s as keyof typeof FINDING_STATUS_LABEL] ?? TASK_STATUS_LABEL[s as keyof typeof TASK_STATUS_LABEL] ?? String(s)

/** One plain-text line for a history entry, without the actor ("marked Fixed, please re-check"). */
export function describeActivity(e: ActivityEntry, names: (id: string) => string): string {
  const d = e.details
  const title = String(d.title ?? '')
  const file = String(d.file_name ?? '')

  switch (e.action) {
    case 'created':
      return 'created this'
    case 'deleted':
      return 'deleted this'
    case 'restored':
      return 'restored this'
    case 'status_changed': {
      const base = `marked ${statusLabel(d.to)}`
      return typeof d.reason === 'string' && d.reason ? `${base}: ${d.reason}` : base
    }
    case 'edited': {
      const fields = (d.fields ?? {}) as Record<string, unknown>
      const parts = Object.entries(fields).map(([k, v]) => describeFieldChange(k, v, names))
      return parts.length > 0 ? parts.join(', ') : 'edited this'
    }
    case 'file_added':
      return `added file ${file}`
    case 'file_removed':
      return `removed file ${file}`
    case 'checklist_added':
      return `added “${title}” to the checklist`
    case 'checklist_renamed':
      return `renamed “${String(d.from ?? '')}” to “${title}”`
    case 'checklist_removed':
      return `removed “${title}” from the checklist`
    case 'checklist_ticked':
      return `ticked “${title}”`
    case 'checklist_unticked':
      return `unticked “${title}”`
  }
}
