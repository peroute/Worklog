import { describe, expect, it } from 'vitest'
import { hedi, khaushik, lead } from '../test/factories'
import { todayColumns } from './todayColumns'

const viewed = '2026-10-29'
const names = (people: { displayName: string }[]) => people.map((p) => p.displayName)

describe('todayColumns', () => {
  it('gives every profile a column, sorted by name, with no role filter', () => {
    expect(names(todayColumns([lead, khaushik, hedi], [], [], viewed))).toEqual(['Hedi', 'Khaushik', 'Lead'])
  })
})
