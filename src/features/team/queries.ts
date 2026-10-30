import { useQuery } from '@tanstack/react-query'
import { listProfiles } from '../../data/profiles'
import type { Profile } from '../../data/types'

/** Everyone on the team. Changes rarely (accounts are created by hand), so cache for long. */
export function useProfiles() {
  return useQuery({ queryKey: ['profiles'], queryFn: listProfiles, staleTime: 5 * 60_000 })
}

/** id → display name lookup, with a safe fallback for unknown ids. */
export function nameOf(profiles: Profile[] | undefined, id: string): string {
  return profiles?.find((p) => p.id === id)?.displayName ?? 'Unknown'
}
