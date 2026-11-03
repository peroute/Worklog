import { supabase } from '../lib/supabase'
import { getSessionUserId } from './auth'
import { DataError, toDataError } from './errors'
import { toProfile, type ProfileRow } from './mappers'
import type { Profile } from './types'

export async function listProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase.from('profiles').select('id, display_name').order('display_name')
  if (error) throw toDataError(error)
  return (data as ProfileRow[]).map(toProfile)
}

export async function getMyProfile(): Promise<Profile> {
  const userId = await getSessionUserId()
  if (!userId) throw new DataError('Not signed in')
  const { data, error } = await supabase.from('profiles').select('id, display_name').eq('id', userId).single()
  if (error) throw toDataError(error, { notFound: 'Profile not found' })
  return toProfile(data as ProfileRow)
}
