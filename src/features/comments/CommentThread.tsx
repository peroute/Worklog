import { useId, useState, type FormEvent } from 'react'
import { Avatar } from '../../components/Avatar'
import { ErrorState } from '../../components/ErrorState'
import { ui } from '../../components/ui'
import type { CommentTarget } from '../../data/types'
import { formatDateTime } from '../../lib/dates'
import { nameOf, useProfiles } from '../team/queries'
import { useAddComment, useComments } from './queries'

/** Back-and-forth between the lead and whoever's work it is. Oldest first. */
export function CommentThread({ target, canComment }: { target: CommentTarget; canComment: boolean }) {
  const headingId = useId()
  const comments = useComments(target)
  const addComment = useAddComment(target)
  const profiles = useProfiles()
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!body.trim()) return
    setError(null)
    try {
      await addComment.mutateAsync(body)
      setBody('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the comment')
    }
  }

  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <h2 id={headingId} className="text-lg font-semibold">
        Comments
      </h2>
      {comments.isError && <ErrorState error={comments.error} />}
      {comments.data?.length === 0 && <p className="text-sm text-fg-subtle">No comments yet.</p>}

      {comments.data && comments.data.length > 0 && (
        <ol className="space-y-3">
          {comments.data.map((comment) => {
            const author = nameOf(profiles.data, comment.authorId)
            return (
              <li key={comment.id} className="flex gap-3">
                <Avatar id={comment.authorId} name={author} size="md" />
                <div className={`${ui.card} min-w-0 flex-1 px-4 py-3`}>
                  <p className="text-xs text-fg-muted">
                    <span className="font-semibold text-fg">{author}</span>
                    <span className="ml-2">{formatDateTime(comment.createdAt)}</span>
                  </p>
                  {/* Plain text: React escapes it, so pasted HTML shows as text. */}
                  <p className="mt-1 text-sm leading-relaxed text-fg whitespace-pre-wrap">{comment.body}</p>
                </div>
              </li>
            )
          })}
        </ol>
      )}

      {canComment && (
        <form onSubmit={onSubmit} className="space-y-2">
          <label className={ui.label}>
            Add a comment
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} className={ui.input} />
          </label>
          {error && <ErrorState error={new Error(error)} />}
          <button type="submit" disabled={!body.trim() || addComment.isPending} className={ui.btnSecondary}>
            Add comment
          </button>
        </form>
      )}
    </section>
  )
}
