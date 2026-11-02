import { FileDropzone } from '../../components/FileDropzone'
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_KINDS,
  attachmentMimeType,
  formatBytes,
  isCompressibleImage,
} from '../../data/attachmentRules'
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_TASK } from '../../data/limits'

interface AttachmentInputProps {
  /** Files picked but not yet uploaded. */
  value: File[]
  onChange: (files: File[]) => void
  /** Attachments already saved on the task; they count toward the limit. */
  existingCount?: number
}

/** Why a file can't be attached to a task, or null if it's fine. */
function validateAttachment(file: File): string | null {
  const mimeType = attachmentMimeType(file)
  if (!mimeType) return `“${file.name}” isn't allowed. Attach ${ATTACHMENT_KINDS}.`
  // Screenshots are compressed to well under the limit before upload, so only check the rest.
  if (!isCompressibleImage(mimeType) && file.size > MAX_ATTACHMENT_BYTES) {
    return `“${file.name}” is ${formatBytes(file.size)}. Max ${formatBytes(MAX_ATTACHMENT_BYTES)} per file.`
  }
  return null
}

/** Attachment picker for tasks: the shared dropzone, allowing screenshots and common documents. */
export function AttachmentInput({ value, onChange, existingCount = 0 }: AttachmentInputProps) {
  return (
    <FileDropzone
      value={value}
      onChange={onChange}
      existingCount={existingCount}
      max={MAX_ATTACHMENTS_PER_TASK}
      validate={validateAttachment}
      tooManyMessage={`Max ${MAX_ATTACHMENTS_PER_TASK} attachments per task`}
      accept={ATTACHMENT_ACCEPT}
      pickLabel="Add files"
      dropNoun="files"
      icon="📎"
      hint={`${ATTACHMENT_KINDS} · max ${formatBytes(MAX_ATTACHMENT_BYTES)} each`}
      removeLabel={(file) => `Remove ${file.name}`}
      testId="attachment-dropzone"
    />
  )
}
