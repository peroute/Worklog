// App-facing types. The UI only ever sees these shapes — never raw Supabase rows —
// so swapping the backend later means changing src/data/*, not the screens.
// Dates are 'YYYY-MM-DD' strings; timestamps are ISO strings.

export type Role = 'lead' | 'member'

export interface Profile {
  id: string
  displayName: string
  role: Role
}

export interface Project {
  id: string
  name: string
  description: string | null
  createdBy: string
  createdAt: string
}

export interface ProjectSummary extends Project {
  openFindings: number
  openTasks: number
}

/** 'brief' = what to do (from the creator). 'proof' = evidence the work is done (from the assignee). */
export type AttachmentKind = 'brief' | 'proof'

/** A file attached to a task (screenshot or document). */
export interface TaskAttachment {
  id: string
  taskId: string
  storagePath: string
  fileName: string
  mimeType: string
  sizeBytes: number
  position: number
  /** Who added it: the task's creator (the brief), the assignee (proof of work), or the lead. */
  uploadedBy: string
  kind: AttachmentKind
  /**
   * Short-lived signed URL. Images open inline; documents carry a download flag so the
   * browser saves them under their original name instead of rendering them.
   */
  url: string
}

/**
 * todo → submitted (waiting for lead) → approved | changes_requested → resubmitted → approved | changes_requested.
 * Same words as FindingStatus, plus `todo` (tasks exist before the work is done).
 */
export type TaskStatus = 'todo' | 'submitted' | 'changes_requested' | 'resubmitted' | 'approved'

export interface Task {
  id: string
  /** null = not tied to any project. */
  projectId: string | null
  title: string
  explanation: string | null
  assignedTo: string
  deadline: string | null
  status: TaskStatus
  doneAt: string | null
  /** The assignee's "what I did" note, handed in with the proof files. */
  submissionNote: string | null
  createdBy: string
  createdAt: string
  /** Checklist progress, for list rows. 0 / 0 = no checklist. */
  checklistTotal: number
  checklistDone: number
}

/** One step in a task's checklist. The creator/lead writes it; the assignee ticks it. */
export interface ChecklistItem {
  id: string
  taskId: string
  title: string
  position: number
  done: boolean
  /** Who ticked it and when — set by the database, never the client. */
  doneBy: string | null
  doneAt: string | null
  createdAt: string
}

export interface NewTask {
  projectId: string | null
  title: string
  explanation: string | null
  assignedTo: string
  deadline: string | null
}

/** submitted (waiting for lead) → approved | changes_requested → resubmitted → approved | changes_requested */
export type FindingStatus = 'submitted' | 'changes_requested' | 'resubmitted' | 'approved'

export interface Finding {
  id: string
  projectId: string
  taskId: string | null
  title: string
  explanation: string
  findingDate: string
  status: FindingStatus
  authorId: string
  createdAt: string
  updatedAt: string
  imageCount: number
}

export interface NewFinding {
  projectId: string
  taskId: string | null
  title: string
  explanation: string
  findingDate: string
}

export interface FindingImage {
  id: string
  findingId: string
  storagePath: string
  position: number
  /** Short-lived signed URL (see SIGNED_URL_TTL_SECONDS). */
  url: string
}

export interface FindingDetail extends Finding {
  images: FindingImage[]
}

export interface Comment {
  id: string
  findingId: string | null
  taskId: string | null
  authorId: string
  body: string
  createdAt: string
}

/** What a comment thread is attached to. */
export type CommentTarget = { findingId: string } | { taskId: string }
