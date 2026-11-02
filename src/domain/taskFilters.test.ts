import { describe, expect, it } from 'vitest'
import { hedi, khaushik, lead } from '../test/factories'
import { ALL_ASSIGNEES, defaultAssigneeFilter } from './taskFilters'

describe('defaultAssigneeFilter', () => {
  it('starts members on their own tasks', () => {
    expect(defaultAssigneeFilter(hedi)).toBe(hedi.id)
    expect(defaultAssigneeFilter(khaushik)).toBe(khaushik.id)
  })

  it('starts the lead on everyone, since overseeing the team is their job', () => {
    expect(defaultAssigneeFilter(lead)).toBe(ALL_ASSIGNEES)
  })

  it('falls back to everyone while the profile is still loading', () => {
    expect(defaultAssigneeFilter(undefined)).toBe(ALL_ASSIGNEES)
  })
})
