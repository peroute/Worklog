import { beforeAll, describe, expect, it } from 'vitest'
import { restoreItem } from '../../src/data/trash'
import { createFinding, getFinding, listFindings } from '../../src/data/findings'
import {
  createProject,
  deleteProject,
  getProject,
  getProjectDeleteCounts,
  listProjects,
  restoreProject,
  updateProject,
} from '../../src/data/projects'
import { createTask, listTasks } from '../../src/data/tasks'
import { fakeImage, listFiles, resetData, userId } from './admin'
import { loginAs } from './session'

describe('projects data layer', () => {
  beforeAll(async () => {
    await resetData()
  })

  it('creates a project that lists with zero open counts', async () => {
    await loginAs('hedi')
    const project = await createProject({ name: 'Mobile App QA', description: 'Android + iOS' })
    const listed = (await listProjects()).find((p) => p.id === project.id)
    expect(listed).toMatchObject({ name: 'Mobile App QA', openFindings: 0, openTasks: 0, deletedAt: null })
  })

  it('rejects a duplicate project name with a readable message', async () => {
    await loginAs('hedi')
    await expect(createProject({ name: 'Mobile App QA', description: null })).rejects.toThrow(
      'A project with this name already exists',
    )
  })

  it('a non-author can edit', async () => {
    await loginAs('hedi')
    const project = await createProject({ name: 'Editable', description: null })
    await loginAs('khaushik')
    const updated = await updateProject(project.id, { description: 'edited by someone else' })
    expect(updated.description).toBe('edited by someone else')
  })

  it('delete hides from list, restore brings back', async () => {
    await loginAs('hedi')
    const project = await createProject({ name: 'Vanishing', description: null })
    await loginAs('khaushik')
    await deleteProject(project.id)
    expect((await listProjects()).some((p) => p.id === project.id)).toBe(false)
    await expect(getProject(project.id)).rejects.toThrow('Project not found')

    await restoreProject(project.id)
    expect((await listProjects()).some((p) => p.id === project.id)).toBe(true)
    expect((await getProject(project.id)).deletedAt).toBeNull()
  })

  it('restoring a project whose name was reused says to rename it first', async () => {
    await loginAs('hedi')
    const old = await createProject({ name: 'Reused name', description: null })
    await deleteProject(old.id)
    await createProject({ name: 'Reused name', description: null })
    await expect(restoreItem({ type: 'project', id: old.id })).rejects.toThrow(
      'A project with this name already exists. Rename it first, then restore.',
    )
  })

  it('project delete hides its tasks and findings, restore brings them back', async () => {
    await loginAs('hedi')
    const project = await createProject({ name: 'Vendor Research', description: null })
    const { finding } = await createFinding(
      { projectId: project.id, taskId: null, title: 'No SSO', explanation: 'Vendor A', findingDate: '2026-10-29' },
      [fakeImage(), fakeImage()],
    )
    await createTask({
      projectId: project.id,
      title: 'Compare pricing',
      explanation: null,
      assignedTo: await userId('hedi'),
      deadline: null,
      startDate: null,
      needsReview: false,
    })

    const summary = (await listProjects()).find((p) => p.id === project.id)
    expect(summary).toMatchObject({ openFindings: 1, openTasks: 1 })

    await loginAs('lead')
    expect(await getProjectDeleteCounts(project.id)).toEqual({ findings: 1, tasks: 1, images: 2, attachments: 0 })

    await deleteProject(project.id)
    expect((await listProjects()).some((p) => p.id === project.id)).toBe(false)
    expect(await listTasks({ projectId: project.id })).toHaveLength(0)
    expect(await listFindings({ projectId: project.id })).toHaveLength(0)
    await expect(getFinding(finding.id)).rejects.toThrow('Finding not found')
    // Files are kept.
    expect(await listFiles(`findings/${finding.id}`)).toHaveLength(2)

    await restoreProject(project.id)
    expect(await listTasks({ projectId: project.id })).toHaveLength(1)
    expect(await listFindings({ projectId: project.id })).toHaveLength(1)
  })
})
