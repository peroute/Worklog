import type { ItemRef } from '../../data/types'
import { useUnseen } from './queries'

/** A small accent dot on list rows for items where someone else acted since you last looked. */
export function NewDot({ item }: { item: ItemRef }) {
  const { isUnseen } = useUnseen()
  if (!isUnseen(item)) return null
  return <span role="img" aria-label="New" title="New" className="inline-block h-2 w-2 shrink-0 rounded-full bg-accent" />
}
