import { beforeAll, describe, expect, it } from 'vitest'
import { addComment, listComments, listLatestComments } from '../../src/data/comments'
import { DataError } from '../../src/data/errors'
import { createFinding, getFinding, setFindingStatus } from '../../src/data/findings'
import { createProject } from '../../src/data/projects'
import { createTask, getTask, setTaskStatus } from '../../src/data/tasks'
import type { Project } from '../../src/data/types'
import { resetData, userId } from './admin'
import { loginAs } from './session'

describe('status changes (flat team)', () => {
  let project: Project
  let hediId: string
  let khaushikId: string

  const newFinding = async (title: string) => {
    const { finding } = await createFinding(
      { projectId: project.id, taskId: null, title, explanation: 'x', findingDate: '2026-11-03' },
      [],
    )
    return finding
  }
  const newTask = (title: string, needsReview: boolean) =>
    createTask({
      projectId: project.id,
      title,
      explanation: null,
      assignedTo: hediId,
      deadline: null,
      startDate: null,
      needsReview,
    })

  beforeAll(async () => {
    await resetData()
    hediId = await userId('hedi')
    khaushikId = await userId('khaushik')
    await loginAs('hedi')
    project = await createProject({ name: 'Status project', description: null })
  })

  it("anyone marks a finding fixed; the fixer can't verify; the reporter can", async () => {
    await loginAs('hedi')
    const finding = await newFinding('Crash')
    expect(finding.status).toBe('open')

    await loginAs('khaushik')
    await setFindingStatus(finding.id, 'fixed')
    const fixed = await getFinding(finding.id)
    expect(fixed).toMatchObject({ status: 'fixed', fixedBy: khaushikId })

    await expect(setFindingStatus(finding.id, 'verified')).rejects.toThrow("you can't verify your own fix")

    await loginAs('hedi')
    await setFindingStatus(finding.id, 'verified')
    expect((await getFinding(finding.id)).status).toBe('verified')
  })

  it('need more info requires a comment and stores it', async () => {
    await loginAs('hedi')
    const finding = await newFinding('Vague')

    await loginAs('khaushik')
    await expect(setFindingStatus(finding.id, 'needs_info')).rejects.toThrow('a comment is required')
    expect((await getFinding(finding.id)).status).toBe('open')
    expect(await listComments({ findingId: finding.id })).toHaveLength(0)

    await setFindingStatus(finding.id, 'needs_info', 'Which device?')
    expect((await getFinding(finding.id)).status).toBe('needs_info')
    const thread = await listComments({ findingId: finding.id })
    expect(thread).toHaveLength(1)
    expect(thread[0]).toMatchObject({ body: 'Which device?', authorId: khaushikId, taskId: null })
  })

  it('refuses a move the rules do not allow', async () => {
    await loginAs('hedi')
    const finding = await newFinding('Skip ahead')
    await expect(setFindingStatus(finding.id, 'verified')).rejects.toBeInstanceOf(DataError)
  })

  it('a refused move says where the item is now, not raw status names', async () => {
    await loginAs('hedi')
    const finding = await newFinding('Moved under you')
    await expect(setFindingStatus(finding.id, 'verified')).rejects.toThrow(
      'This item moved to Open — refresh and try again.',
    )
    const task = await newTask('Moved task', false)
    await expect(setTaskStatus(task.id, 'waiting_for_review')).rejects.toThrow(/^This item moved to /)
  })

  it('an empty note on a status move clears the saved note', async () => {
    await loginAs('hedi')
    const task = await newTask('Clear my note', false)
    await setTaskStatus(task.id, 'in_progress', { note: 'First try' })
    expect((await getTask(task.id)).submissionNote).toBe('First try')
    await setTaskStatus(task.id, 'done', { note: '' })
    expect((await getTask(task.id)).submissionNote).toBe('')
  })

  it("task with review: submitter can't approve, someone else can", async () => {
    await loginAs('khaushik')
    const task = await newTask('Retest login', true)
    expect(task).toMatchObject({ needsReview: true, status: 'todo' })

    // A review task can't skip review.
    await loginAs('hedi')
    await expect(setTaskStatus(task.id, 'done')).rejects.toBeInstanceOf(DataError)

    await setTaskStatus(task.id, 'waiting_for_review')
    const waiting = await getTask(task.id)
    expect(waiting).toMatchObject({ status: 'waiting_for_review', submittedBy: hediId })
    expect(waiting.doneAt).not.toBeNull()

    await expect(setTaskStatus(task.id, 'done')).rejects.toThrow("you can't approve work you submitted")

    await loginAs('khaushik')
    await setTaskStatus(task.id, 'done')
    expect(await getTask(task.id)).toMatchObject({ status: 'done', approvedBy: khaushikId, submittedBy: hediId })
  })

  it("requesting changes on someone else's submission needs a comment", async () => {
    await loginAs('khaushik')
    const task = await newTask('Review me', true)
    await loginAs('hedi')
    await setTaskStatus(task.id, 'waiting_for_review')

    await loginAs('khaushik')
    await expect(setTaskStatus(task.id, 'in_progress')).rejects.toThrow('a comment is required')
    await setTaskStatus(task.id, 'in_progress', { comment: 'Also Android 14' })
    expect((await getTask(task.id)).status).toBe('in_progress')
    expect((await listComments({ taskId: task.id }))[0].body).toBe('Also Android 14')
  })

  it('withdraw without comment', async () => {
    await loginAs('khaushik')
    const task = await newTask('Withdraw me', true)
    await loginAs('hedi')
    await setTaskStatus(task.id, 'waiting_for_review')
    await setTaskStatus(task.id, 'in_progress')
    expect(await getTask(task.id)).toMatchObject({ status: 'in_progress', submittedBy: null })
    expect(await listComments({ taskId: task.id })).toHaveLength(0)
  })

  it('blocked stores the reason', async () => {
    await loginAs('hedi')
    const task = await newTask('Stuck', false)
    await expect(setTaskStatus(task.id, 'blocked')).rejects.toThrow()

    await setTaskStatus(task.id, 'blocked', { reason: 'Waiting on API keys' })
    expect(await getTask(task.id)).toMatchObject({ status: 'blocked', blockedReason: 'Waiting on API keys' })

    await setTaskStatus(task.id, 'in_progress')
    expect(await getTask(task.id)).toMatchObject({ status: 'in_progress', blockedReason: null })
  })

  it('finish with note saves note and status together', async () => {
    await loginAs('hedi')
    const task = await newTask('Quick one', false)
    await setTaskStatus(task.id, 'done', { note: 'Checked on iOS and Android' })
    expect(await getTask(task.id)).toMatchObject({
      status: 'done',
      submissionNote: 'Checked on iOS and Android',
    })
  })

  it('returns the newest comment per item', async () => {
    await loginAs('hedi')
    const finding = await newFinding('Chatty')
    await addComment({ findingId: finding.id }, 'first')
    await loginAs('khaushik')
    await addComment({ findingId: finding.id }, 'second')
    const latest = await listLatestComments({ findingIds: [finding.id] })
    expect(latest[finding.id].body).toBe('second')
  })

  it('reports a missing task clearly', async () => {
    await loginAs('hedi')
    await expect(getTask('00000000-0000-0000-0000-000000000000')).rejects.toThrow('Task not found')
  })
})
