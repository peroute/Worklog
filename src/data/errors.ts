import { FINDING_STATUS_LABEL, TASK_STATUS_LABEL } from '../domain/actions'

/** The only error type the data layer throws. `message` is safe to show to users. */
export class DataError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause })
    this.name = 'DataError'
  }
}

interface BackendError {
  message: string
  code?: string
}

const PERMISSION_DENIED = '42501'
const UNIQUE_VIOLATION = '23505'
const STATUS_LABELS: Record<string, string> = { ...FINDING_STATUS_LABEL, ...TASK_STATUS_LABEL } // names don't overlap
const NO_ROWS = 'PGRST116' // .single() matched zero rows

/**
 * Converts a Supabase/Postgres error into a DataError with a readable message.
 * Guard-trigger messages (code 42501) are already written for humans, so they pass through.
 */
export function toDataError(
  error: BackendError,
  messages: { unique?: string; notFound?: string } = {},
): DataError {
  if (error.code === UNIQUE_VIOLATION && messages.unique) return new DataError(messages.unique, error)
  if (error.code === NO_ROWS && messages.notFound) return new DataError(messages.notFound, error)
  if (error.code === PERMISSION_DENIED) {
    // "not allowed from <current> to <wanted>": the item moved under the user's feet. Say where it is now.
    const refused = /^not allowed from (\w+) to \w+$/.exec(error.message)
    const current = refused && STATUS_LABELS[refused[1]]
    if (current) return new DataError(`This item moved to ${current} — refresh and try again.`, error)
    const isRlsMessage = error.message.startsWith('new row violates row-level security')
    return new DataError(isRlsMessage ? "You don't have permission to do that" : error.message, error)
  }
  return new DataError(error.message || 'Something went wrong', error)
}
