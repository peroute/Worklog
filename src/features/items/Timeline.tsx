import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { ErrorState } from '../../components/ErrorState'
import { LoadingState } from '../../components/LoadingState'
import { ui } from '../../components/ui'
import type { CommentTarget } from '../../data/types'
import { describeActivity, type TimelineEntry } from '../../domain/timeline'
import { formatDateTime } from '../../lib/dates'
import { useAddComment } from '../comments/queries'
import { nameOf, useProfiles } from '../team/queries'
import { itemRefOf, useMarkSeen, useTimeline } from './queries'

function NewChip() {
  return <span className="rounded bg-open-soft px-1.5 py-0.5 text-[11px] font-bold text-open">NEW</span>
}

/**
 * Everything that happened to an item, oldest first: comments as bubbles, history as small lines.
 * Anyone can comment (unless the item is in the Trash). Opening it counts as "seen" for the NEW chips.
 */
export function Timeline({ target, deleted = false }: { target: CommentTarget; deleted?: boolean }) {
  const headingId = useId()
  const profiles = useProfiles()
  const { entries, isError, error } = useTimeline(target)
  const addComment = useAddComment(target)
  const markSeen = useMarkSeen()
  const [body, setBody] = useState('')
  const [commentError, setCommentError] = useState<string | null>(null)
  const seenMarked = useRef(false)

  const ref = itemRefOf(target)
  useEffect(() => {
    if (!entries || seenMarked.current) return
    seenMarked.current = true
    // A failed stamp only means NEW shows again next visit; not worth interrupting the reader.
    markSeen.mutate(ref)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ref is derived from the item id, stamped once per visit
  }, [entries])

  const names = (id: string) => nameOf(profiles.data, id)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!body.trim()) return
    setCommentError(null)
    try {
      await addComment.mutateAsync(body)
      setBody('')
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : 'Could not add the comment')
    }
  }

  function renderEntry(entry: TimelineEntry) {
    if (entry.kind === 'comment') {
      const { comment } = entry
      return (
        <li
          key={`c-${comment.id}`}
          className={`my-2 rounded-lg px-3 py-2 ${entry.isNew ? 'border-l-[3px] border-l-open-edge bg-open-soft' : 'bg-surface-2'}`}
        >
          <p className="text-xs text-fg-muted">
            {entry.isNew && <NewChip />} <span className="font-semibold text-fg">{names(comment.authorId)}</span>
            <span className="ml-2">{formatDateTime(comment.createdAt)}</span>
          </p>
          {/* Plain text: React escapes it, so pasted HTML shows as text. */}
          <p className="mt-1 text-sm leading-relaxed text-fg whitespace-pre-wrap">{comment.body}</p>
        </li>
      )
    }
    const { entry: item } = entry
    const actor = item.actorId ? names(item.actorId) : 'An admin'
    return (
      <li
        key={`a-${item.id}`}
        className={`my-1 text-xs text-fg-muted ${entry.isNew ? 'rounded bg-open-soft px-1 py-0.5' : ''}`}
      >
        <span aria-hidden="true">●</span> {entry.isNew && <NewChip />}{' '}
        <strong className="font-semibold text-fg">{actor}</strong> {describeActivity(item, names)}
        <span className="ml-2">{formatDateTime(item.createdAt)}</span>
      </li>
    )
  }

  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <h2 id={headingId} className="text-lg font-semibold">
        Timeline
      </h2>
      {isError && <ErrorState error={error} />}
      {!entries && !isError && <LoadingState />}
      {entries && (
        <ol className="ml-1 border-l-2 border-line pl-3">
          {entries.length === 0 && <li className="text-sm text-fg-subtle">Nothing yet.</li>}
          {entries.map(renderEntry)}
        </ol>
      )}

      {!deleted && (
        <form onSubmit={onSubmit} className="space-y-2">
          <label className={ui.label}>
            Add a comment
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              placeholder="Write a comment… (anyone on the team)"
              className={ui.input}
            />
          </label>
          {commentError && <ErrorState error={new Error(commentError)} />}
          <button type="submit" disabled={!body.trim() || addComment.isPending} className={ui.btnSecondary}>
            Add comment
          </button>
        </form>
      )}
    </section>
  )
}
