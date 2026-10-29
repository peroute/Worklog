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

export type TaskStatus = 'todo' | 'done'

export interface Task {
  id: string
  projectId: string
  title: string
  explanation: string | null
  assignedTo: string
  deadline: string | null
  status: TaskStatus
  doneAt: string | null
  createdBy: string
  createdAt: string
}

export interface NewTask {
  projectId: string
  title: string
  explanation: string | null
  assignedTo: string
  deadline: string | null
}

export type FindingStatus = 'open' | 'closed'

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
