import { beforeAll, describe, expect, it } from 'vitest'
import { DataError } from '../../src/data/errors'
import {
  createFinding,
  deleteFinding,
  getFinding,
  listFindings,
  setFindingStatus,
  updateFinding,
} from '../../src/data/findings'
import { createProject } from '../../src/data/projects'
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
    expect(finding).toMatchObject({ title: 'Login crash', status: 'open', authorId: await userId('hedi'), imageCount: 2 })

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

  it('lets any member close someone else\'s finding but not edit or delete it', async () => {
    await loginAs('khaushik')
    const [target] = await listFindings({ projectId: project.id, status: 'open' })
    expect((await setFindingStatus(target.id, 'closed')).status).toBe('closed')
    await expect(updateFinding(target.id, { title: 'hijacked' })).rejects.toThrow(
      'only the author or lead can edit this finding',
    )
    await expect(deleteFinding(target.id)).rejects.toBeInstanceOf(DataError)
    expect(await listFiles(`findings/${target.id}`)).not.toHaveLength(0)
  })

  it('deletes a finding together with its screenshot files', async () => {
    await loginAs('hedi')
    const { finding } = await createFinding(base('To delete'), [fakeImage(), fakeImage()])
    expect(await listFiles(`findings/${finding.id}`)).toHaveLength(2)
    await deleteFinding(finding.id)
    expect(await listFiles(`findings/${finding.id}`)).toHaveLength(0)
    await expect(getFinding(finding.id)).rejects.toThrow('Finding not found')
  })
})
