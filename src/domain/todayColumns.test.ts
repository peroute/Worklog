import { describe, expect, it } from 'vitest'
import { hedi, khaushik, lead } from '../test/factories'
import { todayColumns } from './todayColumns'

const names = (people: { displayName: string }[]) => people.map((p) => p.displayName)

describe('todayColumns', () => {
  it('gives every profile a column, sorted by name, with no role filter', () => {
    expect(names(todayColumns([lead, khaushik, hedi]))).toEqual(['Hedi', 'Khaushik', 'Lead'])
  })
})
