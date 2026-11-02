import { supabase } from '../lib/supabase'
import { DataError, toDataError } from './errors'
import { listImagePaths, removeStoredFiles } from './images'
import { listTaskAttachmentPaths, removeTaskAttachmentFiles } from './taskAttachments'
import { toProject, toProjectSummary, type ProjectRow, type ProjectSummaryRow } from './mappers'
import type { Project, ProjectSummary } from './types'

const DUPLICATE_NAME = 'A project with this name already exists'

export async function listProjects(): Promise<ProjectSummary[]> {
  const { data, error } = await supabase.from('project_summaries').select('*').order('name')
  if (error) throw toDataError(error)
  return (data as ProjectSummaryRow[]).map(toProjectSummary)
}

export async function getProject(id: string): Promise<Project> {
  const { data, error } = await supabase.from('projects').select('*').eq('id', id).single()
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

/** What a project delete would remove — shown in the confirmation dialog. */
export async function getProjectDeleteCounts(
  id: string,
): Promise<{ findings: number; tasks: number; images: number; attachments: number }> {
  const [findings, tasks, images, attachments] = await Promise.all([
    supabase.from('findings').select('id', { count: 'exact', head: true }).eq('project_id', id),
    supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('project_id', id),
    supabase
      .from('finding_images')
      .select('id, findings!inner(project_id)', { count: 'exact', head: true })
      .eq('findings.project_id', id),
    // !inner join: only attachments whose task is in this project.
    supabase
      .from('task_attachments')
      .select('id, tasks!inner(project_id)', { count: 'exact', head: true })
      .eq('tasks.project_id', id),
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
 * Deletes a project with its tasks, findings, screenshots and task attachments (lead only).
 * Order: collect file paths → delete rows (permission enforced here) → remove files.
 * If we removed files first, a refused delete would still destroy screenshots.
 */
export async function deleteProject(id: string): Promise<void> {
  const { data: findingRows, error: findingsError } = await supabase.from('findings').select('id').eq('project_id', id)
  if (findingsError) throw toDataError(findingsError)
  const paths = await listImagePaths((findingRows as { id: string }[]).map((f) => f.id))
  const { data: taskRows, error: tasksError } = await supabase.from('tasks').select('id').eq('project_id', id)
  if (tasksError) throw toDataError(tasksError)
  const attachmentPaths = await listTaskAttachmentPaths((taskRows as { id: string }[]).map((t) => t.id))

  const { data, error } = await supabase.from('projects').delete().eq('id', id).select('id')
  if (error) throw toDataError(error)
  if (!data || data.length === 0) throw new DataError('Only the lead can delete projects')

  await Promise.all([removeStoredFiles(paths), removeTaskAttachmentFiles(attachmentPaths)])
}
