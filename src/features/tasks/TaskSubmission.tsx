import { useId, useState, type FormEvent } from 'react'
import { Avatar } from '../../components/Avatar'
import { ui } from '../../components/ui'
import type { Profile, Task, TaskAttachment } from '../../data/types'
import { taskActionTarget } from '../../domain/actions'
import { formatDateTime } from '../../lib/dates'
import { nameOf, useProfiles } from '../team/queries'
import { AttachmentInput } from './AttachmentInput'
import { AttachmentList } from './AttachmentList'
import { useChecklist } from './checklistQueries'
import { useSubmitWork } from './queries'

/** submit: "Mark done" (hands in for review, or finishes outright). edit: change note/proof, same status. */
export type SubmissionMode = 'submit' | 'edit'

const MAX_NOTE = 5000

/** What the form says. Finishing a task that needs review is a hand-in; otherwise it just closes the task. */
function copyFor(mode: SubmissionMode, needsReview: boolean) {
  if (mode === 'edit') return { title: 'Edit the submission', button: 'Save', busy: 'Saving…' }
  return needsReview
    ? { title: 'Submit your work', button: 'Submit for review', busy: 'Submitting…' }
    : { title: 'Mark done', button: 'Mark done', busy: 'Finishing…' }
}

interface TaskSubmissionProps {
  task: Task
  me: Profile | undefined
  /** All of the task's saved files; this picks out the proof. */
  attachments: TaskAttachment[]
  /** Open form, or null to show the submission read-only. */
  mode: SubmissionMode | null
  onModeChange: (mode: SubmissionMode | null) => void
}

/**
 * The assignee's hand-in: what they did (a note) + proof (files), shown together so the reviewer
 * sees one thing. Like a pull request description, or an Asana approval request.
 *
 * Shows the form when `mode` is set, otherwise the saved submission. Renders nothing for a
 * task nobody has started handing in.
 */
export function TaskSubmission({ task, me, attachments, mode, onModeChange }: TaskSubmissionProps) {
  const headingId = useId()
  const profiles = useProfiles()
  const proof = attachments.filter((a) => a.kind === 'proof')
  // Everyone on the team may edit the note and proof; the history records who did.
  const hasContent = Boolean(task.submissionNote) || proof.length > 0
  const submitterId = task.submittedBy ?? task.assignedTo
  const submitter = nameOf(profiles.data, submitterId)

  if (mode) {
    return (
      <SubmitWorkForm
        key={mode} // fresh form state each time it opens
        task={task}
        me={me}
        mode={mode}
        proof={proof}
        totalAttachments={attachments.length}
        nextPosition={Math.max(-1, ...attachments.map((a) => a.position)) + 1}
        onClose={() => onModeChange(null)}
      />
    )
  }

  if ((task.status === 'todo' || task.status === 'in_progress') && !hasContent) return null

  return (
    <section aria-labelledby={headingId} className={`${ui.card} space-y-4 p-5`}>
      <div className="flex items-center gap-2">
        <h2 id={headingId} className={ui.sectionTitle}>
          Submission
        </h2>
        <button type="button" onClick={() => onModeChange('edit')} className={`${ui.btnGhost} ml-auto`}>
          Edit submission
        </button>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <Avatar id={submitterId} name={submitter} size="sm" />
        <span className="font-semibold text-fg">{submitterId === me?.id ? 'You' : submitter}</span>
        {task.doneAt && (
          <span className="text-fg-muted">
            {task.needsReview ? 'submitted' : 'finished'} {formatDateTime(task.doneAt)}
          </span>
        )}
      </div>

      {task.submissionNote ? (
        <p className="text-sm leading-relaxed text-fg whitespace-pre-wrap">{task.submissionNote}</p>
      ) : (
        <p className="text-sm text-fg-muted italic">No explanation given.</p>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-fg">
          Proof <span className="text-fg-muted">({proof.length})</span>
        </h3>
        {proof.length > 0 ? (
          <AttachmentList attachments={proof} task={task} me={me} showUploader />
        ) : (
          <p className="text-sm text-fg-muted">No files attached.</p>
        )}
      </div>
    </section>
  )
}

interface SubmitWorkFormProps {
  task: Task
  me: Profile | undefined
  mode: SubmissionMode
  proof: TaskAttachment[]
  /** Brief and proof share one position sequence per task. */
  totalAttachments: number
  nextPosition: number
  onClose: () => void
}

/** The note + proof form. Proof already saved can be removed here; new files upload on submit. */
function SubmitWorkForm({ task, me, mode, proof, totalAttachments, nextPosition, onClose }: SubmitWorkFormProps) {
  const headingId = useId()
  const noteId = useId()
  const submitWork = useSubmitWork(task.id)
  const checklist = useChecklist(task.id)
  // Only when handing work in: editing an existing submission doesn't change what was ticked.
  const handingIn = mode === 'submit'
  const items = checklist.data ?? []
  const unticked = items.filter((item) => !item.done)
  const [note, setNote] = useState(task.submissionNote ?? '')
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const copy = copyFor(mode, task.needsReview)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await submitWork.mutateAsync({
        // '' clears a note that was saved before; null leaves "no note" as it is (no pointless history entry).
        note: note.trim() || (task.submissionNote ? '' : null),
        files,
        startPosition: nextPosition,
        to: mode === 'submit' ? taskActionTarget('finish', task) : null,
      })
      onClose()
    } catch (err) {
      setFiles([]) // the ones that uploaded are now in the saved list above; don't upload them twice
      setError(err instanceof Error ? err.message : 'Could not submit your work')
    }
  }

  return (
    <section aria-labelledby={headingId} className={`${ui.card} border-accent/40 p-5 ring-1 ring-accent/20`}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <h2 id={headingId} className="text-base font-semibold text-fg">
            {copy.title}
          </h2>
          <p className="mt-1 text-sm text-fg-muted">
            {task.needsReview
              ? 'Tell the reviewer what you did and attach proof, so they can approve it without having to ask.'
              : 'What did you do? Add a note and any proof for the record.'}
          </p>
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-overdue-soft px-3 py-2 text-sm font-medium text-overdue">
            {error}
          </p>
        )}

        <div>
          <label htmlFor={noteId} className={ui.label}>
            What did you do?
          </label>
          <textarea
            id={noteId}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={5}
            maxLength={MAX_NOTE}
            autoFocus
            placeholder={
              'e.g. Retested login on Android 13 and 14. Both pass, screenshots attached.\n' +
              "Couldn't test iOS: no device available."
            }
            className={`${ui.input} resize-y`}
          />
          <p className="mt-1 text-right text-xs text-fg-subtle">
            {note.length.toLocaleString()} / {MAX_NOTE.toLocaleString()}
          </p>
        </div>

        <div className="space-y-2">
          <p className={ui.label}>
            Proof <span className="font-normal text-fg-muted">(optional: screenshots, logs, files)</span>
          </p>
          <AttachmentList attachments={proof} task={task} me={me} />
          <AttachmentInput value={files} onChange={setFiles} existingCount={totalAttachments} />
        </div>

        {handingIn && unticked.length > 0 && (
          <div role="status" className="rounded-lg border border-open-edge/40 bg-open-soft px-3 py-2.5 text-sm text-open">
            <p className="font-medium">
              {unticked.length} of {items.length} checklist items aren't ticked. You can still submit — say why in your
              note.
            </p>
            <ul className="mt-1 list-disc pl-5">
              {unticked.map((item) => (
                <li key={item.id}>{item.title}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <button type="button" onClick={onClose} className={ui.btnSecondary} disabled={submitWork.isPending}>
            Cancel
          </button>
          <button type="submit" className={ui.btnPrimary} disabled={submitWork.isPending}>
            {submitWork.isPending ? copy.busy : copy.button}
          </button>
        </div>
      </form>
    </section>
  )
}
