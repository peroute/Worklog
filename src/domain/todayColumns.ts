import type { Finding, Profile, Task } from '../data/types'

/**
 * Who gets a column on the Today screen (spec §7.2): every member, sorted by name,
 * plus the lead only when they have an open task or logged a finding that day.
 */
export function todayColumns(profiles: Profile[], tasks: Task[], findings: Finding[], viewedDate: string): Profile[] {
  const byName = (a: Profile, b: Profile) => a.displayName.localeCompare(b.displayName)
  const members = profiles.filter((p) => p.role === 'member').sort(byName)

  const activeLeads = profiles
    .filter((p) => p.role === 'lead')
    .filter(
      (lead) =>
        tasks.some((t) => t.assignedTo === lead.id && t.status === 'todo') ||
        findings.some((f) => f.authorId === lead.id && f.findingDate === viewedDate),
    )
    .sort(byName)

  return [...members, ...activeLeads]
}
