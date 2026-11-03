import { supabase } from '../lib/supabase'
import { toDataError } from './errors'
import { toProject, toProjectSummary, type ProjectRow, type ProjectSummaryRow } from './mappers'
import { restore, softDelete } from './softDelete'
import type { Project, ProjectSummary } from './types'

const DUPLICATE_NAME = 'A project with this name already exists'

export async function listProjects(): Promise<ProjectSummary[]> {
  const { data, error } = await supabase.from('project_summaries').select('*').order('name')
  if (error) throw toDataError(error)
  return (data as ProjectSummaryRow[]).map(toProjectSummary)
}

export async function getProject(id: string): Promise<Project> {
  const { data, error } = await supabase.from('live_projects').select('*').eq('id', id).single()
  if (error) throw toDataError(error, { notFound: 'Project not found' })
  return toProject(data as ProjectRow)
}

export async function createProject(input: { name: string; description: string | null }): Promise<Project> {
  const { data, error } = await supabase
    .from('projects')
    .insert({ name: input.name.trim(), description: input.description })
    .select('*')
    .single()
  if (error) throw toDataError(error, { unique: DUPLICATE_NAME })
  return toProject(data as ProjectRow)
}

export async function updateProject(
  id: string,
  patch: Partial<{ name: string; description: string | null }>,
): Promise<Project> {
  const row: Record<string, unknown> = {}
  if (patch.name !== undefined) row.name = patch.name.trim()
  if (patch.description !== undefined) row.description = patch.description
  const { data, error } = await supabase.from('projects').update(row).eq('id', id).select('*').single()
  if (error) throw toDataError(error, { unique: DUPLICATE_NAME, notFound: 'Project not found' })
  return toProject(data as ProjectRow)
}

/** What a project delete would hide (live children only): shown in the confirmation dialog. */
export async function getProjectDeleteCounts(
  id: string,
): Promise<{ findings: number; tasks: number; images: number; attachments: number }> {
  const [findings, tasks, images, attachments] = await Promise.all([
    supabase.from('live_findings').select('id', { count: 'exact', head: true }).eq('project_id', id),
    supabase.from('live_tasks').select('id', { count: 'exact', head: true }).eq('project_id', id),
    // !inner join: only images whose finding is in this project and still live.
    supabase
      .from('finding_images')
      .select('id, findings!inner(project_id, deleted_at)', { count: 'exact', head: true })
      .eq('findings.project_id', id)
      .is('findings.deleted_at', null)
      .is('deleted_at', null),
    supabase
      .from('task_attachments')
      .select('id, tasks!inner(project_id, deleted_at)', { count: 'exact', head: true })
      .eq('tasks.project_id', id)
      .is('tasks.deleted_at', null)
      .is('deleted_at', null),
  ])
  for (const result of [findings, tasks, images, attachments]) {
    if (result.error) throw toDataError(result.error)
  }
  return {
    findings: findings.count ?? 0,
    tasks: tasks.count ?? 0,
    images: images.count ?? 0,
    attachments: attachments.count ?? 0,
  }
}

/**
 * Hides a project. Its tasks and findings disappear with it (the live_* views hide children of
 * a deleted project) but are not touched, so restoring the project brings them all back.
 */
export const deleteProject = (id: string): Promise<void> => softDelete('projects', id, 'Project')

export const restoreProject = (id: string): Promise<void> => restore('projects', id, 'Project')
