import type { Finding, Profile, Project, Task } from '../data/types'

const everyoneExcept = (profiles: Profile[], id: string) => profiles.filter((p) => p.id !== id).map((p) => p.id)

/**
 * Who has to act next on a finding (spec §9). An open finding goes to whoever handed out the task
 * (or created the project); if that is the reporter themself, it goes to everyone else.
 */
export function whoseTurnFinding(
  f: Finding,
  ctx: { tasks: Task[]; projects: Project[]; profiles: Profile[] },
): string[] {
  switch (f.status) {
    case 'open': {
      const task = f.taskId ? ctx.tasks.find((t) => t.id === f.taskId) : undefined
      const owner = task?.createdBy ?? ctx.projects.find((p) => p.id === f.projectId)?.createdBy
      return owner && owner !== f.authorId ? [owner] : everyoneExcept(ctx.profiles, f.authorId)
    }
    case 'needs_info':
      return [f.authorId]
    case 'fixed':
      // The reporter verifies; if they fixed it themself, somebody else has to.
      return f.fixedBy === f.authorId ? everyoneExcept(ctx.profiles, f.authorId) : [f.authorId]
    case 'not_a_bug':
    case 'verified':
      return []
  }
}

/** Who has to act next on a task (spec §9). */
export function whoseTurnTask(t: Task, profiles: Profile[]): string[] {
  switch (t.status) {
    case 'todo':
    case 'in_progress':
    case 'blocked':
      return [t.assignedTo]
    case 'waiting_for_review': {
      // Whoever may approve: the creator, unless the creator is the one who submitted it.
      const submitter = t.submittedBy ?? t.assignedTo
      return t.createdBy !== submitter ? [t.createdBy] : everyoneExcept(profiles, submitter)
    }
    case 'done':
      return []
  }
}
