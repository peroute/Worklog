import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { listActivity } from '../../data/activity'
import { setFindingStatus } from '../../data/findings'
import { getLastSeen, listUnseen, markSeen } from '../../data/reads'
import { setTaskStatus } from '../../data/tasks'
import type { CommentTarget, FindingStatus, ItemRef, TaskStatus } from '../../data/types'
import { buildTimeline } from '../../domain/timeline'
import { useMe } from '../auth/useMe'
import { useComments } from '../comments/queries'

/** Which item a comment target belongs to (the NEW markers are keyed by item, not by comment). */
export const itemRefOf = (target: CommentTarget): ItemRef =>
  'findingId' in target ? { type: 'finding', id: target.findingId } : { type: 'task', id: target.taskId }

/**
 * Comments + history + "when did I last look", merged into one list for the timeline.
 *
 * lastSeen is read ONCE per visit and never refetched, on purpose: opening the page calls markSeen,
 * and if we re-read lastSeen afterwards every NEW chip would vanish the moment you arrive. gcTime 0
 * drops it when you leave, so coming back later reads the fresh value instead of a stale one.
 */
export function useTimeline(target: CommentTarget) {
  const ref = itemRefOf(target)
  const { me } = useMe()
  const comments = useComments(target)
  const activity = useQuery({ queryKey: ['activity', ref.id], queryFn: () => listActivity(target) })
  const lastSeen = useQuery({
    queryKey: ['lastSeen', ref.type, ref.id],
    queryFn: () => getLastSeen(ref),
    staleTime: Infinity,
    gcTime: 0,
  })

  const entries = useMemo(
    () =>
      me && comments.data && activity.data && lastSeen.data !== undefined
        ? buildTimeline(comments.data, activity.data, me, lastSeen.data)
        : undefined,
    [me, comments.data, activity.data, lastSeen.data],
  )
  const failed = [comments, activity, lastSeen].find((q) => q.isError)
  return { entries, isError: Boolean(failed), error: failed?.error ?? null }
}

export type StatusChange =
  | { type: 'finding'; id: string; to: FindingStatus; comment?: string }
  | { type: 'task'; id: string; to: TaskStatus; comment?: string; reason?: string; note?: string }

/** Everything that shows an item's status, its history or a comment. */
const ITEM_VIEWS = ['findings', 'tasks', 'projects', 'today', 'review', 'comments', 'activity', 'unseen']

/**
 * One call for any status move. Settles with a refetch whether it worked or not: when the database
 * refuses (someone else already moved it), the page must show what the item looks like *now*.
 */
export function useItemStatusMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (change: StatusChange) => {
      if (change.type === 'finding') return setFindingStatus(change.id, change.to, change.comment)
      const opts: { comment?: string; reason?: string; note?: string } = {}
      if (change.comment !== undefined) opts.comment = change.comment
      if (change.reason !== undefined) opts.reason = change.reason
      if (change.note !== undefined) opts.note = change.note
      return setTaskStatus(change.id, change.to, opts)
    },
    onSettled: () => Promise.all(ITEM_VIEWS.map((key) => queryClient.invalidateQueries({ queryKey: [key] }))),
  })
}

const unseenKey = (ref: ItemRef) => `${ref.type}:${ref.id}`
// Module-level so react-query can reuse the result until the data changes (one Set, not one per row).
const toKeySet = (refs: ItemRef[]) => new Set(refs.map(unseenKey))

/**
 * Items where someone else acted since I last looked. Rows ask `isUnseen(ref)` to decide on a NEW dot.
 * While loading (or if the list failed) nothing is unseen: a missing dot is better than a wrong one.
 */
export function useUnseen() {
  const query = useQuery({ queryKey: ['unseen'], queryFn: listUnseen, select: toKeySet })
  const keys = query.data
  return { ...query, isUnseen: (ref: ItemRef) => keys?.has(unseenKey(ref)) ?? false }
}

/** "I just opened this." Refreshes the unseen list (nav badge / inbox) once the stamp lands. */
export function useMarkSeen() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (ref: ItemRef) => markSeen(ref),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['unseen'] }),
  })
}
