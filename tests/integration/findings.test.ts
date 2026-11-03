import { beforeAll, describe, expect, it } from 'vitest'
import {
  createFinding,
  deleteFinding,
  getFinding,
  listFindings,
  restoreFinding,
  updateFinding,
} from '../../src/data/findings'
import { deleteFindingImage, getFindingImagesFor } from '../../src/data/images'
import { createProject, deleteProject } from '../../src/data/projects'
import { createTask } from '../../src/data/tasks'
import type { NewFinding, Project } from '../../src/data/types'
import { fakeImage, listFiles, resetData, userId } from './admin'
import { loginAs } from './session'

describe('findings data layer', () => {
  let project: Project
  const base = (title: string): NewFinding => ({
    projectId: project.id,
    taskId: null,
    title,
    explanation: 'Steps:\n1. open app\n2. crash',
    findingDate: '2026-10-29',
  })

  beforeAll(async () => {
    await resetData()
    await loginAs('hedi')
    project = await createProject({ name: 'Findings project', description: null })
  })

  it('creates a finding with ordered, signed screenshots', async () => {
    await loginAs('hedi')
    const { finding, failedUploads } = await createFinding(base('Login crash'), [fakeImage(), fakeImage('image/jpeg')])
    expect(failedUploads).toBe(0)
    expect(finding).toMatchObject({
      title: 'Login crash',
      status: 'open',
      authorId: await userId('hedi'),
      imageCount: 2,
      fixedBy: null,
      deletedAt: null,
    })

    const detail = await getFinding(finding.id)
    expect(detail.images.map((i) => i.position)).toEqual([0, 1])
    expect(detail.images[0].url).toMatch(/^http/)
    expect(detail.images[0].storagePath).toMatch(new RegExp(`^findings/${finding.id}/[0-9a-f-]+\\.webp$`))
    expect(detail.images[1].storagePath).toMatch(/\.jpg$/)
  })

  it('keeps the finding and the good screenshots when one upload fails', async () => {
    await loginAs('hedi')
    // A PDF is rejected by the bucket's allowed MIME types: a real server-side failure.
    const { finding, failedUploads } = await createFinding(base('Partial'), [
      fakeImage(),
      new Blob(['%PDF-1.4'], { type: 'application/pdf' }),
      fakeImage(),
    ])
    expect(failedUploads).toBe(1)
    const detail = await getFinding(finding.id)
    expect(detail.images).toHaveLength(2)
    expect(detail.images.map((i) => i.position)).toEqual([0, 2])
  })

  it('lists findings by date with image counts', async () => {
    await loginAs('khaushik')
    const listed = await listFindings({ projectId: project.id, date: '2026-10-29' })
    expect(listed.map((f) => f.title).sort()).toEqual(['Login crash', 'Partial'])
    expect(listed.find((f) => f.title === 'Login crash')?.imageCount).toBe(2)
    expect(await listFindings({ projectId: project.id, date: '2026-10-28' })).toHaveLength(0)
  })

  it('a non-author can edit', async () => {
    await loginAs('khaushik')
    const [target] = await listFindings({ projectId: project.id })
    const updated = await updateFinding(target.id, { title: 'Edited by someone else' })
    expect(updated.title).toBe('Edited by someone else')
    await updateFinding(target.id, { title: target.title })
  })

  it('loads screenshots for many findings at once, grouped and ordered', async () => {
    await loginAs('khaushik')
    const listed = await listFindings({ projectId: project.id, date: '2026-10-29' })
    const withImages = listed.find((f) => f.title === 'Login crash')!
    const grouped = await getFindingImagesFor(listed.map((f) => f.id))

    expect(grouped[withImages.id].map((i) => i.position)).toEqual([0, 1])
    expect(grouped[withImages.id][0].url).toMatch(/^http/)
    expect(await getFindingImagesFor([])).toEqual({})
  })

  it('delete hides from list, restore brings back (files are kept)', async () => {
    await loginAs('hedi')
    const { finding } = await createFinding(base('To delete'), [fakeImage(), fakeImage()])
    await loginAs('khaushik')
    await deleteFinding(finding.id)

    expect((await listFindings({ projectId: project.id })).some((f) => f.id === finding.id)).toBe(false)
    await expect(getFinding(finding.id)).rejects.toThrow('Finding not found')
    expect(await listFiles(`findings/${finding.id}`)).toHaveLength(2)

    await restoreFinding(finding.id)
    expect((await listFindings({ projectId: project.id })).some((f) => f.id === finding.id)).toBe(true)
    expect((await getFinding(finding.id)).images).toHaveLength(2)
  })

  it('removing a screenshot hides it but keeps the file', async () => {
    await loginAs('hedi')
    const { finding } = await createFinding(base('Image removal'), [fakeImage(), fakeImage()])
    const detail = await getFinding(finding.id)
    await deleteFindingImage(detail.images[0])
    expect((await getFinding(finding.id)).images).toHaveLength(1)
    expect(await listFiles(`findings/${finding.id}`)).toHaveLength(2)
  })

  it('project delete hides its findings', async () => {
    await loginAs('hedi')
    const doomed = await createProject({ name: 'Doomed findings', description: null })
    const { finding } = await createFinding({ ...base('Child'), projectId: doomed.id }, [])
    await deleteProject(doomed.id)
    expect(await listFindings({ projectId: doomed.id })).toHaveLength(0)
    await expect(getFinding(finding.id)).rejects.toThrow('Finding not found')
  })

  it('listFindings({ taskId })', async () => {
    await loginAs('hedi')
    const task = await createTask({
      projectId: project.id,
      title: 'Linked',
      explanation: null,
      assignedTo: await userId('hedi'),
      deadline: null,
      startDate: null,
      needsReview: false,
    })
    const { finding } = await createFinding({ ...base('Linked finding'), taskId: task.id }, [])
    const linked = await listFindings({ taskId: task.id })
    expect(linked.map((f) => f.id)).toEqual([finding.id])
  })
})
