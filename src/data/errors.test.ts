import { describe, expect, it } from 'vitest'
import { toDataError } from './errors'

describe('toDataError', () => {
  it('turns a refused status move into "moved to <Label>"', () => {
    const err = toDataError({ code: '42501', message: 'not allowed from needs_info to fixed' })
    expect(err.message).toBe('This item moved to Need more info — refresh and try again.')
    const task = toDataError({ code: '42501', message: 'not allowed from waiting_for_review to done' })
    expect(task.message).toBe('This item moved to Waiting for review — refresh and try again.')
  })

  it('leaves other guard messages alone', () => {
    expect(toDataError({ code: '42501', message: 'a comment is required' }).message).toBe('a comment is required')
  })

  it('uses the unique message on a unique violation', () => {
    expect(toDataError({ code: '23505', message: 'dup' }, { unique: 'Taken' }).message).toBe('Taken')
  })
})
