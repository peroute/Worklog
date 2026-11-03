import { beforeAll, describe, expect, it } from 'vitest'
import {
  addChecklistItems,
  listChecklist,
  renameChecklistItem,
  setChecklistItemDone,
} from '../../src/data/checklist'
import { createProject } from '../../src/data/projects'
import { createTask, getTask, listTasks } from '../../src/data/tasks'
import type { Task } from '../../src/data/types'
import { resetData, userId } from './admin'
import { loginAs } from './session'

describe('checklist data layer', () => {
  let task: Task
  let hediId: string

  beforeAll(async () => {
    await resetData()
    await loginAs('khaushik')
    hediId = await userId('hedi')
    const project = await createProject({ name: 'Checklist project', description: null })
    task = await createTask({ projectId: project.id, title: 'Fix crash', explanation: null, assignedTo: hediId, deadline: null, startDate: null, needsReview: false })
  })

  it('lets the creator add items, in order, with trimmed titles', async () => {
    await loginAs('khaushik')
    await addChecklistItems(task.id, [
      { title: '  Reproduce  ', position: 0 },
      { title: 'Fix', position: 1 },
    ])
    const items = await listChecklist(task.id)
    expect(items.map((i) => i.title)).toEqual(['Reproduce', 'Fix'])
    expect(await getTask(task.id)).toMatchObject({ checklistTotal: 2, checklistDone: 0 })
  })

  it('lets the assignee tick, stamping who did it', async () => {
    await loginAs('hedi')
    const [first] = await listChecklist(task.id)
    const ticked = await setChecklistItemDone(first.id, true)
    expect(ticked).toMatchObject({ done: true, doneBy: hediId })
    expect(ticked.doneAt).not.toBeNull()
    const [row] = await listTasks({ assignedTo: hediId })
    expect(row).toMatchObject({ checklistTotal: 2, checklistDone: 1 })
  })

  it('lets any teammate rename an item (everyone is equal)', async () => {
    await loginAs('hedi')
    const [first] = await listChecklist(task.id)
    const renamed = await renameChecklistItem(first.id, 'Reproduce on iOS')
    expect(renamed.title).toBe('Reproduce on iOS')
  })
})
