import { beforeAll, describe, expect, it } from 'vitest'
import { listActivity } from '../../src/data/activity'
import { addComment } from '../../src/data/comments'
import { createFinding, deleteFinding, updateFinding } from '../../src/data/findings'
import { createProject, deleteProject } from '../../src/data/projects'
import { getLastSeen, listUnseen, markSeen } from '../../src/data/reads'
import { createTask, deleteTask, getTask } from '../../src/data/tasks'
import { listTrash, restoreItem } from '../../src/data/trash'
import type { Project } from '../../src/data/types'
import { resetData, userId } from './admin'
import { loginAs } from './session'

describe('activity, reads and trash (flat team)', () => {
  let project: Project
  let hediId: string

  const newFinding = async (title: string, projectId = project.id) => {
    const { finding } = await createFinding(
      { projectId, taskId: null, title, explanation: 'x', findingDate: '2026-11-03' },
      [],
    )
    return finding
  }
  const newTask = (title: string, projectId: string | null = project.id) =>
    createTask({
      projectId,
      title,
      explanation: null,
      assignedTo: hediId,
      deadline: null,
      startDate: null,
      needsReview: false,
    })

  beforeAll(async () => {
    await resetData()
    hediId = await userId('hedi')
    await loginAs('hedi')
    project = await createProject({ name: 'History project', description: null })
  })

  it('editing a title shows up in listActivity with from/to', async () => {
    await loginAs('hedi')
    const finding = await newFinding('Old title')
    await updateFinding(finding.id, { title: 'New title' })

    const entries = await listActivity({ findingId: finding.id })
    expect(entries.map((e) => e.action)).toEqual(['created', 'edited'])
    expect(entries[1]).toMatchObject({
      actorId: hediId,
      details: { fields: { title: { from: 'Old title', to: 'New title' } } },
    })
  })

  it('a comment by khaushik makes the finding unseen for hedi until markSeen', async () => {
    await loginAs('hedi')
    const finding = await newFinding('Needs eyes')
    await markSeen({ type: 'finding', id: finding.id })
    expect(await getLastSeen({ type: 'finding', id: finding.id })).not.toBeNull()
    expect(await listUnseen()).not.toContainEqual({ type: 'finding', id: finding.id })

    await loginAs('khaushik')
    await addComment({ findingId: finding.id }, 'looking')

    await loginAs('hedi')
    expect(await listUnseen()).toContainEqual({ type: 'finding', id: finding.id })
    await markSeen({ type: 'finding', id: finding.id })
    expect(await listUnseen()).not.toContainEqual({ type: 'finding', id: finding.id })
  })

  it('my own comment does not make it unseen for me', async () => {
    await loginAs('hedi')
    const finding = await newFinding('Mine')
    await markSeen({ type: 'finding', id: finding.id })
    await addComment({ findingId: finding.id }, 'note to self')
    expect(await listUnseen()).not.toContainEqual({ type: 'finding', id: finding.id })
  })

  it('getLastSeen is null for an item never opened', async () => {
    await loginAs('khaushik')
    const task = await newTask('Never opened')
    await loginAs('hedi')
    expect(await getLastSeen({ type: 'task', id: task.id })).toBeNull()
  })

  it('trash lists a deleted finding with deletedBy', async () => {
    await loginAs('hedi')
    const finding = await newFinding('To trash')
    await loginAs('khaushik')
    await deleteFinding(finding.id)

    const trash = await listTrash()
    const item = trash.find((t) => t.id === finding.id)
    expect(item).toMatchObject({ type: 'finding', title: 'To trash', deletedBy: await userId('khaushik') })
    expect(item?.deletedAt).toBeTruthy()
  })

  it('trash hides children of deleted projects', async () => {
    await loginAs('hedi')
    const doomed = await createProject({ name: 'Doomed', description: null })
    const child = await newFinding('Child finding', doomed.id)
    const childTask = await newTask('Child task', doomed.id)
    const loose = await newTask('Loose task', null)
    await deleteTask(loose.id)
    await deleteProject(doomed.id)

    const trash = await listTrash()
    expect(trash.some((t) => t.type === 'project' && t.id === doomed.id && t.title === 'Doomed')).toBe(true)
    expect(trash.some((t) => t.id === child.id)).toBe(false)
    expect(trash.some((t) => t.id === childTask.id)).toBe(false)
    expect(trash.some((t) => t.id === loose.id)).toBe(true)
  })

  it('restoreItem brings a task back', async () => {
    await loginAs('hedi')
    const task = await newTask('Come back')
    await deleteTask(task.id)
    expect((await listTrash()).some((t) => t.id === task.id)).toBe(true)

    await restoreItem({ type: 'task', id: task.id })
    expect((await getTask(task.id)).title).toBe('Come back')
    expect((await listTrash()).some((t) => t.id === task.id)).toBe(false)
  })
})
