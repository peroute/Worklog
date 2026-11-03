// App-facing types. The UI only ever sees these shapes — never raw Supabase rows —
// so swapping the backend later means changing src/data/*, not the screens.
// Dates are 'YYYY-MM-DD' strings; timestamps are ISO strings.

export interface Profile {
  id: string
  displayName: string
}

/** Points at a task or a finding (activity feed, NEW markers, links). */
export interface ItemRef {
  type: 'task' | 'finding'
  id: string
}

/** Set when an item is soft-deleted (hidden, not erased). Live reads never return deleted rows. */
interface SoftDeletable {
  deletedAt: string | null
  deletedBy: string | null
}

export interface Project extends SoftDeletable {
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

/** A label for the file: 'brief' = what to do, 'proof' = evidence the work is done. Anyone on the team may add either. */
export type AttachmentKind = 'brief' | 'proof'

/** A file attached to a task (screenshot or document). */
export interface TaskAttachment extends SoftDeletable {
  id: string
  taskId: string
  storagePath: string
  fileName: string
  mimeType: string
  sizeBytes: number
  position: number
  /** Who added it. */
  uploadedBy: string
  kind: AttachmentKind
  /**
   * Short-lived signed URL. Images open inline; documents carry a download flag so the
   * browser saves them under their original name instead of rendering them.
   */
  url: string
}

/**
 * todo ⇄ in_progress ⇄ blocked; done directly, or via waiting_for_review when the task needs review.
 * Moves go through setTaskStatus (the database enforces the allowed arrows).
 */
export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'waiting_for_review' | 'done'

export interface Task extends SoftDeletable {
  id: string
  /** null = not tied to any project. */
  projectId: string | null
  title: string
  explanation: string | null
  assignedTo: string
  deadline: string | null
  /** First day it shows on Today ('YYYY-MM-DD'); null = visible right away. */
  startDate: string | null
  status: TaskStatus
  /** A second person must approve before it counts as done. */
  needsReview: boolean
  /** Why it is blocked; set only while status is 'blocked'. */
  blockedReason: string | null
  /** Who handed it in for review (set by the database). */
  submittedBy: string | null
  /** Who approved it (set by the database). */
  approvedBy: string | null
  doneAt: string | null
  /** The assignee's "what I did" note, handed in with the proof files. */
  submissionNote: string | null
  createdBy: string
  createdAt: string
  /** Checklist progress, for list rows. 0 / 0 = no checklist. */
  checklistTotal: number
  checklistDone: number
}

/** One step in a task's checklist. Anyone on the team can write and tick it. */
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
  startDate: string | null
  needsReview: boolean
}

/** open → fixed → verified (by someone other than the fixer); needs_info / not_a_bug are side exits. */
export type FindingStatus = 'open' | 'needs_info' | 'fixed' | 'not_a_bug' | 'verified'

export interface Finding extends SoftDeletable {
  id: string
  projectId: string
  taskId: string | null
  title: string
  explanation: string
  findingDate: string
  status: FindingStatus
  authorId: string
  /** Who marked it fixed (set by the database); null unless status is 'fixed' or 'verified'. */
  fixedBy: string | null
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

export interface FindingImage extends SoftDeletable {
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

/** Every action the database writes into the activity history (see the activity triggers). */
export type ActivityAction =
  | 'created'
  | 'edited'
  | 'status_changed'
  | 'deleted'
  | 'restored'
  | 'file_added'
  | 'file_removed'
  | 'checklist_added'
  | 'checklist_renamed'
  | 'checklist_removed'
  | 'checklist_ticked'
  | 'checklist_unticked'

/** One line of an item's history. `details` shape depends on `action`; null actor = done by an admin. */
export interface ActivityEntry {
  id: string
  actorId: string | null
  action: ActivityAction
  details: Record<string, unknown>
  createdAt: string
}

/** A soft-deleted project, task or finding. `title` is the project name for projects. */
export interface TrashItem {
  type: 'project' | 'task' | 'finding'
  id: string
  title: string
  deletedAt: string
  deletedBy: string | null
}
