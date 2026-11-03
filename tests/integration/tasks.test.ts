import { beforeAll, describe, expect, it } from 'vitest'
import { createProject, deleteProject } from '../../src/data/projects'
import {
  createTask,
  deleteTask,
  getTask,
  listTasks,
  restoreTask,
  setTaskStatus,
  updateTask,
} from '../../src/data/tasks'
import type { Project } from '../../src/data/types'
import { resetData, userId } from './admin'
import { loginAs } from './session'

describe('tasks data layer', () => {
  let project: Project
  let hediId: string

  beforeAll(async () => {
    await resetData()
    await loginAs('khaushik')
    project = await createProject({ name: 'Tasks project', description: null })
    hediId = await userId('hedi')
  })

  it('creates a todo task assigned to someone else', async () => {
    await loginAs('khaushik')
    const task = await createTask({
      projectId: project.id,
      title: 'Retest login',
      explanation: 'Line 1\nLine 2',
      assignedTo: hediId,
      deadline: '2026-11-05',
      startDate: null,
      needsReview: false,
    })
    expect(task).toMatchObject({
      title: 'Retest login',
      explanation: 'Line 1\nLine 2',
      assignedTo: hediId,
      deadline: '2026-11-05',
      status: 'todo',
      doneAt: null,
      needsReview: false,
      blockedReason: null,
      submittedBy: null,
      approvedBy: null,
      deletedAt: null,
    })
  })

  it('lets the assignee finish a no-review task, stamping doneAt', async () => {
    await loginAs('hedi')
    const [task] = await listTasks({ projectId: project.id, assignedTo: hediId })
    await setTaskStatus(task.id, 'done')
    const done = await getTask(task.id)
    expect(done.status).toBe('done')
    expect(done.doneAt).not.toBeNull()
    expect(await listTasks({ projectId: project.id, status: 'todo' })).toHaveLength(0)
  })

  it('a non-author can edit (title and note-only edits)', async () => {
    await loginAs('hedi')
    const [task] = await listTasks({ projectId: project.id })
    const renamed = await updateTask(task.id, { title: 'renamed', submissionNote: 'note only' })
    expect(renamed).toMatchObject({ title: 'renamed', submissionNote: 'note only', status: 'done' })
  })

  it('delete hides from list, restore brings back', async () => {
    await loginAs('hedi')
    const [task] = await listTasks({ projectId: project.id })
    await deleteTask(task.id)
    expect(await listTasks({ projectId: project.id })).toHaveLength(0)
    await expect(getTask(task.id)).rejects.toThrow('Task not found')

    await restoreTask(task.id)
    expect((await listTasks({ projectId: project.id })).map((t) => t.id)).toEqual([task.id])
  })

  it('project delete hides its tasks', async () => {
    await loginAs('hedi')
    const doomed = await createProject({ name: 'Doomed tasks', description: null })
    const task = await createTask({
      projectId: doomed.id,
      title: 'Child',
      explanation: null,
      assignedTo: hediId,
      deadline: null,
      startDate: null,
      needsReview: false,
    })
    await deleteProject(doomed.id)
    expect(await listTasks({ projectId: doomed.id })).toHaveLength(0)
    await expect(getTask(task.id)).rejects.toThrow('Task not found')
  })
})
