import { beforeAll, describe, expect, it } from 'vitest'
import { DataError } from '../../src/data/errors'
import { createFinding } from '../../src/data/findings'
import {
  createProject,
  deleteProject,
  getProjectDeleteCounts,
  listProjects,
} from '../../src/data/projects'
import { createTask } from '../../src/data/tasks'
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
    expect(listed).toMatchObject({ name: 'Mobile App QA', openFindings: 0, openTasks: 0 })
  })

  it('rejects a duplicate project name with a readable message', async () => {
    await loginAs('hedi')
    await expect(createProject({ name: 'Mobile App QA', description: null })).rejects.toThrow(
      'A project with this name already exists',
    )
  })

  it('does not let a member delete a project', async () => {
    await loginAs('hedi')
    const project = await createProject({ name: 'Hedi only', description: null })
    await expect(deleteProject(project.id)).rejects.toBeInstanceOf(DataError)
    expect((await listProjects()).some((p) => p.id === project.id)).toBe(true)
  })

  it('counts open work, then lets the lead delete a project and its screenshots', async () => {
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
    })

    const summary = (await listProjects()).find((p) => p.id === project.id)
    expect(summary).toMatchObject({ openFindings: 1, openTasks: 1 })

    await loginAs('lead')
    expect(await getProjectDeleteCounts(project.id)).toEqual({ findings: 1, tasks: 1, images: 2 })
    expect(await listFiles(`findings/${finding.id}`)).toHaveLength(2)

    await deleteProject(project.id)

    expect((await listProjects()).some((p) => p.id === project.id)).toBe(false)
    expect(await listFiles(`findings/${finding.id}`)).toHaveLength(0)
  })
})
