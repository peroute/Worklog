import { useProfiles } from '../features/team/queries'

// Each person gets a stable color for their initials circle. Colors are ASSIGNED by position
// in the team list (sorted by name), so a small team never gets two people in the same color.
const PALETTE = [
  'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
]

function usePersonColor(id: string): string {
  const profiles = useProfiles()
  const index = profiles.data?.findIndex((p) => p.id === id) ?? -1
  return PALETTE[(index < 0 ? 0 : index) % PALETTE.length]
}

const SIZES = { sm: 'h-6 w-6 text-[10px]', md: 'h-8 w-8 text-xs', lg: 'h-10 w-10 text-sm' }

/** Decorative only (aria-hidden): the name is always shown next to it. */
export function Avatar({ id, name, size = 'md' }: { id: string; name: string; size?: keyof typeof SIZES }) {
  const color = usePersonColor(id)
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${SIZES[size]} ${color}`}
    >
      {initials || '?'}
    </span>
  )
}
