import { useQuery } from '@tanstack/react-query'
import { listFindings } from '../../data/findings'

type FindingFilter = Parameters<typeof listFindings>[0]

/** Findings list. Mutation hooks for findings are added in Task 9. */
export function useFindings(filter: FindingFilter = {}) {
  return useQuery({ queryKey: ['findings', filter], queryFn: () => listFindings(filter) })
}
