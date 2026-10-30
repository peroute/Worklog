import type { Finding } from '../data/types'

export interface FindingDayGroup {
  date: string
  findings: Finding[]
}

/** Groups findings by findingDate, newest day first; keeps input order within a day. */
export function groupFindingsByDate(findings: Finding[]): FindingDayGroup[] {
  const byDate = new Map<string, Finding[]>()
  for (const finding of findings) {
    const group = byDate.get(finding.findingDate)
    if (group) group.push(finding)
    else byDate.set(finding.findingDate, [finding])
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, items]) => ({ date, findings: items }))
}
