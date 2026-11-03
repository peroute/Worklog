import { supabase } from '../lib/supabase'
import { toDataError } from './errors'
import { restoreFinding } from './findings'
import { toTrashItem, type TrashRow } from './mappers'
import { restoreProject } from './projects'
import { restoreTask } from './tasks'
import type { TrashItem } from './types'

type WithProject = TrashRow & { project: { deleted_at: string | null } | null }

/** Everything soft-deleted, newest first. Children of a deleted project are left out: they return with it. */
export async function listTrash(): Promise<TrashItem[]> {
  const [projects, tasks, findings] = await Promise.all([
    supabase.from('projects').select('id, name, deleted_at, deleted_by').not('deleted_at', 'is', null),
    supabase
      .from('tasks')
      .select('id, title, deleted_at, deleted_by, project:projects(deleted_at)')
      .not('deleted_at', 'is', null),
    supabase
      .from('findings')
      .select('id, title, deleted_at, deleted_by, project:projects(deleted_at)')
      .not('deleted_at', 'is', null),
  ])
  for (const res of [projects, tasks, findings]) if (res.error) throw toDataError(res.error)

  // A task with no project (null) is never hidden for that reason.
  const projectAlive = (r: WithProject) => !r.project?.deleted_at
  return [
    ...(projects.data as TrashRow[]).map((r) => toTrashItem('project', r)),
    ...(tasks.data as unknown as WithProject[]).filter(projectAlive).map((r) => toTrashItem('task', r)),
    ...(findings.data as unknown as WithProject[]).filter(projectAlive).map((r) => toTrashItem('finding', r)),
  ].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
}

/** Brings one item back by calling the matching restore function. */
export function restoreItem(item: Pick<TrashItem, 'type' | 'id'>): Promise<void> {
  switch (item.type) {
    case 'project':
      return restoreProject(item.id)
    case 'task':
      return restoreTask(item.id)
    case 'finding':
      return restoreFinding(item.id)
  }
}
