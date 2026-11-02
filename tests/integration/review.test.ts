import { beforeAll, describe, expect, it } from 'vitest'
import { addComment, listComments, listLatestComments } from '../../src/data/comments'
import { DataError } from '../../src/data/errors'
import { createFinding, getFinding, requestChangesFinding, setFindingStatus } from '../../src/data/findings'
import { createProject } from '../../src/data/projects'
import { createTask, getTask, requestChangesTask, setTaskStatus } from '../../src/data/tasks'
import type { Finding, Project, Task } from '../../src/data/types'
import { resetData, userId } from './admin'
import { loginAs } from './session'

describe('review flow data layer', () => {
  let project: Project
  let finding: Finding
  let task: Task

  beforeAll(async () => {
    await resetData()
    await loginAs('hedi')
    project = await createProject({ name: 'Review project', description: null })
    ;({ finding } = await createFinding(
      { projectId: project.id, taskId: null, title: 'Crash', explanation: 'x', findingDate: '2026-10-30' },
      [],
    ))
    await loginAs('lead')
    task = await createTask({
      projectId: project.id,
      title: 'Retest',
      explanation: null,
      assignedTo: await userId('hedi'),
      deadline: null,
    })
  })

  it('lets the lead send a finding back with a comment', async () => {
    await loginAs('lead')
    await requestChangesFinding(finding.id, 'Need the error log too')
    expect((await getFinding(finding.id)).status).toBe('changes_requested')
    const thread = await listComments({ findingId: finding.id })
    expect(thread).toHaveLength(1)
    expect(thread[0]).toMatchObject({ body: 'Need the error log too', authorId: await userId('lead'), taskId: null })
  })

  it('rejects a blank send-back comment', async () => {
    await loginAs('lead')
    await expect(requestChangesTask(task.id, '   ')).rejects.toThrow('a comment is required to request changes')
  })

  it('lets the author reply and mark fixed, but not close', async () => {
    await loginAs('hedi')
    await addComment({ findingId: finding.id }, 'Added the log screenshot')
    expect((await setFindingStatus(finding.id, 'resubmitted')).status).toBe('resubmitted')
    await expect(setFindingStatus(finding.id, 'approved')).rejects.toBeInstanceOf(DataError)

    const thread = await listComments({ findingId: finding.id })
    expect(thread.map((c) => c.body)).toEqual(['Need the error log too', 'Added the log screenshot'])
  })

  it('lets the lead close a fixed finding', async () => {
    await loginAs('lead')
    expect((await setFindingStatus(finding.id, 'approved')).status).toBe('approved')
  })

  it('runs the task loop: submitted → changes requested → resubmitted → approved', async () => {
    await loginAs('hedi')
    await setTaskStatus(task.id, 'submitted')
    await loginAs('lead')
    await requestChangesTask(task.id, 'Also Android 14')
    expect((await getTask(task.id)).status).toBe('changes_requested')
    await loginAs('hedi')
    await setTaskStatus(task.id, 'resubmitted')
    await loginAs('lead')
    const approved = await setTaskStatus(task.id, 'approved')
    expect(approved.status).toBe('approved')
    expect(approved.doneAt).not.toBeNull()
  })

  it('returns the newest comment per item', async () => {
    await loginAs('khaushik')
    const latest = await listLatestComments({ findingIds: [finding.id], taskIds: [task.id] })
    expect(latest[finding.id].body).toBe('Added the log screenshot')
    expect(latest[task.id].body).toBe('Also Android 14')
  })

  it('reports a missing task clearly', async () => {
    await loginAs('hedi')
    await expect(getTask('00000000-0000-0000-0000-000000000000')).rejects.toThrow('Task not found')
  })
})
