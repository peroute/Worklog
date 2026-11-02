// Translate database rows (snake_case) to app types (camelCase) and back.
// This is the seam a future FastAPI backend would replace.
import type {
  Comment,
  Finding,
  FindingImage,
  FindingStatus,
  NewFinding,
  NewTask,
  Profile,
  Project,
  ProjectSummary,
  Role,
  Task,
  TaskAttachment,
  TaskStatus,
} from './types'

export interface ProfileRow {
  id: string
  display_name: string
  role: Role
}

export interface ProjectRow {
  id: string
  name: string
  description: string | null
  created_by: string
  created_at: string
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
  status: TaskStatus
  done_at: string | null
  created_by: string
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
  created_at: string
  updated_at: string
  /** Present when selected with `finding_images(count)`. */
  finding_images?: { count: number }[]
}

export interface FindingImageRow {
  id: string
  finding_id: string
  storage_path: string
  position: number
}

export interface TaskAttachmentRow {
  id: string
  task_id: string
  storage_path: string
  file_name: string
  mime_type: string
  size_bytes: number
  position: number
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

export const toProfile = (r: ProfileRow): Profile => ({ id: r.id, displayName: r.display_name, role: r.role })

export const toProject = (r: ProjectRow): Project => ({
  id: r.id,
  name: r.name,
  description: r.description,
  createdBy: r.created_by,
  createdAt: r.created_at,
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
  status: r.status,
  doneAt: r.done_at,
  createdBy: r.created_by,
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
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  imageCount: r.finding_images?.[0]?.count ?? 0,
})

export const toFindingImage = (r: FindingImageRow, url: string): FindingImage => ({
  id: r.id,
  findingId: r.finding_id,
  storagePath: r.storage_path,
  position: r.position,
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

export const taskPatchToRow = (patch: Partial<NewTask>) =>
  pick<NewTask>(patch, {
    projectId: 'project_id',
    title: 'title',
    explanation: 'explanation',
    assignedTo: 'assigned_to',
    deadline: 'deadline',
  })

export const findingPatchToRow = (patch: Partial<NewFinding>) =>
  pick<NewFinding>(patch, {
    projectId: 'project_id',
    taskId: 'task_id',
    title: 'title',
    explanation: 'explanation',
    findingDate: 'finding_date',
  })
