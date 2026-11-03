import { describe, expect, it } from 'vitest'
import { makeChecklistItem } from '../test/factories'
import { diffChecklist, isValidChecklistTitle, planChecklistSave } from './checklist'

const saved = [
  makeChecklistItem({ id: 'a', title: 'Reproduce', position: 0 }),
  makeChecklistItem({ id: 'b', title: 'Fix', position: 1 }),
]

describe('diffChecklist', () => {
  it('does nothing for an empty list with no changes', () => {
    expect(diffChecklist([], [])).toEqual({ remove: [], rename: [], add: [], reposition: [] })
  })

  it('does nothing when the draft matches what is saved', () => {
    expect(diffChecklist(saved, [{ id: 'a', title: 'Reproduce' }, { id: 'b', title: 'Fix' }])).toEqual({
      remove: [],
      rename: [],
      add: [],
      reposition: [],
    })
  })

  it('adds new items at their place in the draft, trimmed', () => {
    expect(diffChecklist([], [{ title: ' One ' }, { title: 'Two' }]).add).toEqual([
      { title: 'One', position: 0 },
      { title: 'Two', position: 1 },
    ])
  })

  it('removes saved items missing from the draft', () => {
    const ops = diffChecklist(saved, [{ id: 'b', title: 'Fix' }])
    expect(ops.remove).toEqual(['a'])
    expect(ops.reposition).toEqual([{ id: 'b', position: 0 }])
  })

  it('repositions swapped items', () => {
    expect(diffChecklist(saved, [{ id: 'b', title: 'Fix' }, { id: 'a', title: 'Reproduce' }]).reposition).toEqual([
      { id: 'b', position: 0 },
      { id: 'a', position: 1 },
    ])
  })

  it('renames only when the trimmed title changed', () => {
    expect(diffChecklist(saved, [{ id: 'a', title: 'Reproduce  ' }, { id: 'b', title: 'Fix it' }]).rename).toEqual([
      { id: 'b', title: 'Fix it' },
    ])
  })

  it('ignores draft ids that are no longer saved (deleted in another tab)', () => {
    const ops = diffChecklist(saved, [{ id: 'gone', title: 'Old' }, { id: 'a', title: 'Reproduce' }, { id: 'b', title: 'Fix' }])
    expect(ops).toEqual({
      remove: [],
      rename: [],
      add: [],
      reposition: [
        { id: 'a', position: 1 },
        { id: 'b', position: 2 },
      ],
    })
  })
})

describe('isValidChecklistTitle', () => {
  it('needs 1 to 200 characters after trimming', () => {
    expect(isValidChecklistTitle('   ')).toBe(false)
    expect(isValidChecklistTitle('x'.repeat(200))).toBe(true)
    expect(isValidChecklistTitle('x'.repeat(201))).toBe(false)
    expect(isValidChecklistTitle('  ok  ')).toBe(true)
  })
})

// The form compares against the list as it was when opened, but writes against what's there now.
describe('planChecklistSave', () => {
  const atOpen = saved // a: Reproduce, b: Fix

  it('keeps an item someone else added while the form was open', () => {
    const current = [...saved, makeChecklistItem({ id: 'c', title: 'Check logs', position: 2 })]
    const ops = planChecklistSave(atOpen, current, [{ id: 'a', title: 'Reproduce' }, { id: 'b', title: 'Fix' }])
    expect(ops.remove).toEqual([])
  })

  it('still deletes what the user removed', () => {
    const ops = planChecklistSave(atOpen, saved, [{ id: 'b', title: 'Fix' }])
    expect(ops.remove).toEqual(['a'])
  })

  it('skips items deleted elsewhere and still adds the new ones', () => {
    const current = [saved[0]] // b was deleted in another tab
    const ops = planChecklistSave(atOpen, current, [{ id: 'b', title: 'Fix' }, { title: 'Write tests' }])
    expect(ops).toEqual({ remove: ['a'], rename: [], add: [{ title: 'Write tests', position: 1 }], reposition: [] })
  })
})
