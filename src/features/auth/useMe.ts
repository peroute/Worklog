import { useQuery } from '@tanstack/react-query'
import { getMyProfile } from '../../data/profiles'
import type { Profile } from '../../data/types'
import { useSession } from './SessionProvider'

/** The signed-in user's profile (name + role). Cached for the whole session. */
export function useMe(): { me: Profile | undefined; isLoading: boolean; error: Error | null } {
  const userId = useSession()
  const query = useQuery({
    queryKey: ['me', userId],
    queryFn: getMyProfile,
    enabled: Boolean(userId),
    staleTime: Infinity,
  })
  return { me: query.data, isLoading: query.isLoading, error: query.error }
}
