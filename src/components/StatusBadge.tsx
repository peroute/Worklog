import type { FindingStatus, TaskStatus } from '../data/types'
import { FINDING_STATUS_LABEL, TASK_STATUS_LABEL } from '../domain/actions'

type Tone = { pill: string; dot: string }

const AMBER: Tone = { pill: 'bg-open-soft text-open ring-open-edge/40', dot: 'bg-open-edge' }
const VIOLET: Tone = { pill: 'bg-review-soft text-review ring-review-edge/40', dot: 'bg-review-edge' }
const SKY: Tone = { pill: 'bg-fixed-soft text-fixed ring-fixed-edge/40', dot: 'bg-fixed-edge' }
const RED: Tone = { pill: 'bg-overdue-soft text-overdue ring-overdue-edge/40', dot: 'bg-overdue-edge' }
const GREEN: Tone = { pill: 'bg-done-soft text-done ring-done-edge/40', dot: 'bg-done-edge' }
const SLATE: Tone = { pill: 'bg-surface-2 text-fg-muted ring-line-strong', dot: 'bg-fg-subtle' }
const GREY: Tone = { pill: 'bg-surface-2 text-fg-subtle ring-line', dot: 'bg-line-strong' }

// Badge color = whose turn it is (spec §9): amber needs someone, violet needs an answer, sky needs a re-check,
// red is stuck, green is finished, slate is simply underway, grey is dismissed.
const TONE: Record<FindingStatus | TaskStatus, Tone> = {
  open: AMBER,
  waiting_for_review: AMBER,
  needs_info: VIOLET,
  fixed: SKY,
  blocked: RED,
  verified: GREEN,
  done: GREEN,
  todo: SLATE,
  in_progress: SLATE,
  not_a_bug: GREY,
}

// Labels come from the domain so a badge and a history line ("marked Verified") always agree.
const LABEL: Record<FindingStatus | TaskStatus, string> = { ...TASK_STATUS_LABEL, ...FINDING_STATUS_LABEL }

export function StatusBadge({ status }: { status: FindingStatus | TaskStatus }) {
  const { pill, dot } = TONE[status]
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${pill}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {LABEL[status]}
    </span>
  )
}
