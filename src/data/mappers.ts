// Translate database rows (snake_case) to app types (camelCase) and back.
// This is the seam a future FastAPI backend would replace.
import type {
  ActivityAction,
  ActivityEntry,
  AttachmentKind,
  ChecklistItem,
  Comment,
  Finding,
  FindingImage,
  FindingStatus,
  NewFinding,
  NewTask,
  Profile,
  Project,
  ProjectSummary,
  Task,
  TaskAttachment,
  TaskStatus,
  TrashItem,
} from './types'

export interface ProfileRow {
  id: string
  display_name: string
}

export interface ProjectRow {
  id: string
  name: string
  description: string | null
  created_by: string
  created_at: string
  deleted_at: string | null
  deleted_by: string | null
}

export interface ProjectSummaryRow extends ProjectRow {
  open_findings: number
  open_tasks: number
}

export interface TaskRow {
  id: string
  project_id: string | null
  title: string
  explanation: string | null
  assigned_to: string
  deadline: string | null
  start_date: string | null
  status: TaskStatus
  needs_review: boolean
  blocked_reason: string | null
  submitted_by: string | null
  approved_by: string | null
  done_at: string | null
  submission_note: string | null
  created_by: string
  created_at: string
  deleted_at: string | null
  deleted_by: string | null
  /** Embedded by TASK_COLUMNS (src/data/tasks.ts): just the done flag of each checklist item. */
  checklist?: { done: boolean }[]
}

export interface ChecklistItemRow {
  id: string
  task_id: string
  title: string
  position: number
  done: boolean
  done_by: string | null
  done_at: string | null
  created_at: string
}

export interface FindingRow {
  id: string
  project_id: string
  task_id: string | null
  title: string
  explanation: string
  finding_date: string
  status: FindingStatus
  author_id: string
  fixed_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  deleted_by: string | null
  /** Present when selected with `finding_images(count)`. */
  finding_images?: { count: number }[]
}

export interface FindingImageRow {
  id: string
  finding_id: string
  storage_path: string
  position: number
  deleted_at: string | null
  deleted_by: string | null
}

export interface TaskAttachmentRow {
  id: string
  task_id: string
  storage_path: string
  file_name: string
  mime_type: string
  size_bytes: number
  position: number
  uploaded_by: string
  kind: AttachmentKind
  deleted_at: string | null
  deleted_by: string | null
}

export interface CommentRow {
  id: string
  finding_id: string | null
  task_id: string | null
  author_id: string
  body: string
  created_at: string
}

export const toComment = (r: CommentRow): Comment => ({
  id: r.id,
  findingId: r.finding_id,
  taskId: r.task_id,
  authorId: r.author_id,
  body: r.body,
  createdAt: r.created_at,
})

export const toProfile = (r: ProfileRow): Profile => ({ id: r.id, displayName: r.display_name })

export const toProject = (r: ProjectRow): Project => ({
  id: r.id,
  name: r.name,
  description: r.description,
  createdBy: r.created_by,
  createdAt: r.created_at,
  deletedAt: r.deleted_at,
  deletedBy: r.deleted_by,
})

export const toProjectSummary = (r: ProjectSummaryRow): ProjectSummary => ({
  ...toProject(r),
  openFindings: r.open_findings,
  openTasks: r.open_tasks,
})

export const toTask = (r: TaskRow): Task => ({
  id: r.id,
  projectId: r.project_id,
  title: r.title,
  explanation: r.explanation,
  assignedTo: r.assigned_to,
  deadline: r.deadline,
  startDate: r.start_date,
  status: r.status,
  needsReview: r.needs_review,
  blockedReason: r.blocked_reason,
  submittedBy: r.submitted_by,
  approvedBy: r.approved_by,
  doneAt: r.done_at,
  submissionNote: r.submission_note,
  createdBy: r.created_by,
  createdAt: r.created_at,
  deletedAt: r.deleted_at,
  deletedBy: r.deleted_by,
  checklistTotal: r.checklist?.length ?? 0,
  checklistDone: r.checklist?.filter((i) => i.done).length ?? 0,
})

export const toChecklistItem = (r: ChecklistItemRow): ChecklistItem => ({
  id: r.id,
  taskId: r.task_id,
  title: r.title,
  position: r.position,
  done: r.done,
  doneBy: r.done_by,
  doneAt: r.done_at,
  createdAt: r.created_at,
})

export const toFinding = (r: FindingRow): Finding => ({
  id: r.id,
  projectId: r.project_id,
  taskId: r.task_id,
  title: r.title,
  explanation: r.explanation,
  findingDate: r.finding_date,
  status: r.status,
  authorId: r.author_id,
  fixedBy: r.fixed_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at,
  deletedBy: r.deleted_by,
  imageCount: r.finding_images?.[0]?.count ?? 0,
})

export const toFindingImage = (r: FindingImageRow, url: string): FindingImage => ({
  id: r.id,
  findingId: r.finding_id,
  storagePath: r.storage_path,
  position: r.position,
  deletedAt: r.deleted_at,
  deletedBy: r.deleted_by,
  url,
})

export const toTaskAttachment = (r: TaskAttachmentRow, url: string): TaskAttachment => ({
  id: r.id,
  taskId: r.task_id,
  storagePath: r.storage_path,
  fileName: r.file_name,
  mimeType: r.mime_type,
  sizeBytes: r.size_bytes,
  position: r.position,
  uploadedBy: r.uploaded_by,
  kind: r.kind,
  deletedAt: r.deleted_at,
  deletedBy: r.deleted_by,
  url,
})

/** Builds a DB patch from a partial app object, keeping only the keys that were passed. */
function pick<T extends object>(patch: Partial<T>, columns: Record<keyof T, string>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  for (const key of Object.keys(patch) as (keyof T)[]) {
    if (patch[key] !== undefined) row[columns[key]] = patch[key]
  }
  return row
}

/** `submissionNote` is editable on its own (a note-only edit), so it is accepted here besides NewTask's fields. */
export const taskPatchToRow = (patch: Partial<NewTask> & { submissionNote?: string | null }) =>
  pick<NewTask & { submissionNote: string | null }>(patch, {
    needsReview: 'needs_review',
    submissionNote: 'submission_note',
    projectId: 'project_id',
    title: 'title',
    explanation: 'explanation',
    assignedTo: 'assigned_to',
    deadline: 'deadline',
    startDate: 'start_date',
  })

export const findingPatchToRow = (patch: Partial<NewFinding>) =>
  pick<NewFinding>(patch, {
    projectId: 'project_id',
    taskId: 'task_id',
    title: 'title',
    explanation: 'explanation',
    findingDate: 'finding_date',
  })

export interface ActivityRow {
  id: string
  actor_id: string | null
  action: ActivityAction
  details: Record<string, unknown>
  created_at: string
}

export const toActivityEntry = (r: ActivityRow): ActivityEntry => ({
  id: r.id,
  actorId: r.actor_id,
  action: r.action,
  details: r.details,
  createdAt: r.created_at,
})

/** A soft-deleted row from projects / tasks / findings, reduced to what the trash page shows. */
export interface TrashRow {
  id: string
  name?: string
  title?: string
  deleted_at: string
  deleted_by: string | null
}

export const toTrashItem = (type: TrashItem['type'], r: TrashRow): TrashItem => ({
  type,
  id: r.id,
  title: (type === 'project' ? r.name : r.title) ?? '',
  deletedAt: r.deleted_at,
  deletedBy: r.deleted_by,
})
