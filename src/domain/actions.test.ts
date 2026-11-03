import { describe, expect, it } from 'vitest'
import { hedi, khaushik, lead, makeFinding, makeTask } from '../test/factories'
import {
  ACTION_LABEL,
  FINDING_ACTION_TARGET,
  findingActions,
  needsComment,
  needsReason,
  taskActionTarget,
  taskActions,
} from './actions'

describe('findingActions', () => {
  it('open finding offers markFixed/needInfo/notABug', () => {
    expect(findingActions(hedi, makeFinding({ status: 'open' }))).toEqual(['markFixed', 'needInfo', 'notABug'])
  })

  it('needs_info offers reply, markFixed, notABug', () => {
    expect(findingActions(hedi, makeFinding({ status: 'needs_info' }))).toEqual(['reply', 'markFixed', 'notABug'])
  })

  it('fixer gets no verify', () => {
    const f = makeFinding({ status: 'fixed', fixedBy: lead.id })
    expect(findingActions(lead, f)).toEqual(['stillBroken'])
  })

  it('reporter gets verify on fixed', () => {
    const f = makeFinding({ status: 'fixed', authorId: hedi.id, fixedBy: lead.id })
    expect(findingActions(hedi, f)).toEqual(['verify', 'stillBroken'])
  })

  it('closed findings can only be reopened', () => {
    expect(findingActions(hedi, makeFinding({ status: 'not_a_bug' }))).toEqual(['reopen'])
    expect(findingActions(hedi, makeFinding({ status: 'verified' }))).toEqual(['reopen'])
  })

  it('targets match the transition table', () => {
    expect(FINDING_ACTION_TARGET.reply).toBe('open')
    expect(FINDING_ACTION_TARGET.stillBroken).toBe('open')
    expect(FINDING_ACTION_TARGET.verify).toBe('verified')
    expect(FINDING_ACTION_TARGET.markFixed).toBe('fixed')
    expect(FINDING_ACTION_TARGET.needInfo).toBe('needs_info')
    expect(FINDING_ACTION_TARGET.notABug).toBe('not_a_bug')
    expect(FINDING_ACTION_TARGET.reopen).toBe('open')
  })
})

describe('taskActions', () => {
  it('todo offers start, block, finish; in progress offers backToTodo, block, finish', () => {
    expect(taskActions(hedi, makeTask({ status: 'todo' }))).toEqual(['start', 'block', 'finish'])
    expect(taskActions(hedi, makeTask({ status: 'in_progress' }))).toEqual(['backToTodo', 'block', 'finish'])
  })

  it('blocked offers unblock', () => {
    expect(taskActions(hedi, makeTask({ status: 'blocked', blockedReason: 'x' }))).toEqual(['unblock'])
  })

  it('finish targets waiting_for_review only when needsReview', () => {
    expect(taskActionTarget('finish', makeTask({ needsReview: true }))).toBe('waiting_for_review')
    expect(taskActionTarget('finish', makeTask({ needsReview: false }))).toBe('done')
  })

  it('submitter gets withdraw not requestChanges or approve', () => {
    const t = makeTask({ status: 'waiting_for_review', submittedBy: hedi.id })
    expect(taskActions(hedi, t)).toEqual(['withdraw'])
  })

  it('other gets approve and requestChanges', () => {
    const t = makeTask({ status: 'waiting_for_review', submittedBy: hedi.id })
    expect(taskActions(khaushik, t)).toEqual(['approve', 'requestChanges'])
  })

  it('done offers reopen', () => {
    expect(taskActions(hedi, makeTask({ status: 'done' }))).toEqual(['reopen'])
  })

  it('other targets', () => {
    const t = makeTask()
    expect(taskActionTarget('approve', t)).toBe('done')
    expect(taskActionTarget('requestChanges', t)).toBe('in_progress')
    expect(taskActionTarget('withdraw', t)).toBe('in_progress')
    expect(taskActionTarget('unblock', t)).toBe('in_progress')
    expect(taskActionTarget('backToTodo', t)).toBe('todo')
    expect(taskActionTarget('block', t)).toBe('blocked')
    expect(taskActionTarget('reopen', t)).toBe('in_progress')
  })
})

describe('needsComment / needsReason / labels', () => {
  it('flags the right actions', () => {
    for (const a of ['needInfo', 'notABug', 'reply', 'stillBroken', 'reopen', 'requestChanges'] as const) {
      expect(needsComment(a)).toBe(true)
    }
    for (const a of ['markFixed', 'verify', 'start', 'finish', 'approve', 'withdraw', 'block', 'backToTodo', 'unblock'] as const) {
      expect(needsComment(a)).toBe(false)
    }
    expect(needsReason('block')).toBe(true)
    expect(needsReason('start')).toBe(false)
  })

  it('uses the exact copy', () => {
    expect(ACTION_LABEL.markFixed).toBe('Mark fixed')
    expect(ACTION_LABEL.block).toBe('Blocked…')
    expect(ACTION_LABEL.finish).toBe('Mark done')
    expect(ACTION_LABEL.reopen).toBe('Reopen')
    expect(ACTION_LABEL.backToTodo).toBe('Back to To do')
  })
})
