import { beforeAll, describe, expect, it } from 'vitest'
import { DataError } from '../../src/data/errors'
import { createProject } from '../../src/data/projects'
import { createTask, deleteTask, listTasks, setTaskStatus, updateTask } from '../../src/data/tasks'
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
    })
    expect(task).toMatchObject({
      title: 'Retest login',
      explanation: 'Line 1\nLine 2',
      assignedTo: hediId,
      deadline: '2026-11-05',
      status: 'todo',
      doneAt: null,
    })
  })

  it('lets the assignee mark it done, stamping doneAt', async () => {
    await loginAs('hedi')
    const [task] = await listTasks({ projectId: project.id, assignedTo: hediId })
    const done = await setTaskStatus(task.id, 'submitted')
    expect(done.status).toBe('submitted')
    expect(done.doneAt).not.toBeNull()
    expect(await listTasks({ projectId: project.id, status: 'todo' })).toHaveLength(0)
  })

  it('stops the assignee from editing a task someone else created', async () => {
    await loginAs('hedi')
    const [task] = await listTasks({ projectId: project.id })
    await expect(updateTask(task.id, { title: 'renamed' })).rejects.toThrow('not allowed to edit this task')
  })

  it('stops the assignee from deleting a task someone else created', async () => {
    await loginAs('hedi')
    const [task] = await listTasks({ projectId: project.id })
    await expect(deleteTask(task.id)).rejects.toBeInstanceOf(DataError)
    expect(await listTasks({ projectId: project.id })).toHaveLength(1)
  })
})
