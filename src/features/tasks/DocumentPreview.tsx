import { useEffect, useRef, useState } from 'react'
import { ErrorState } from '../../components/ErrorState'
import { LoadingState } from '../../components/LoadingState'
import { ui } from '../../components/ui'
import { canPreview } from '../../data/attachmentRules'
import { downloadTaskAttachment } from '../../data/taskAttachments'
import type { TaskAttachment } from '../../data/types'

const SAFE_LINK = /^(https?:|mailto:|#)/i

/**
 * docx-preview copies link targets from the file as-is, so a crafted .docx could carry a
 * `javascript:` link that runs on our origin. Keep only web, mail and in-document links.
 */
export function neutralizeLinks(container: HTMLElement) {
  for (const link of container.querySelectorAll('a')) {
    const href = link.getAttribute('href') ?? ''
    if (!SAFE_LINK.test(href)) link.removeAttribute('href')
    else if (!href.startsWith('#')) {
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
    }
  }
}

interface DocumentPreviewProps {
  attachment: TaskAttachment
  onClose: () => void
}

/** Full-screen modal showing a PDF (browser viewer) or .docx (docx-preview) without downloading it. */
export function DocumentPreview({ attachment, onClose }: DocumentPreviewProps) {
  const kind = canPreview(attachment.mimeType)
  const docxRef = useRef<HTMLDivElement>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null

    async function load() {
      try {
        const blob = await downloadTaskAttachment(attachment.storagePath)
        if (cancelled) return
        if (kind === 'pdf') {
          // Force the type: whatever the bytes really are, the browser only ever opens its PDF viewer.
          objectUrl = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }))
          setPdfUrl(objectUrl)
        } else if (kind === 'docx' && docxRef.current) {
          const { renderAsync } = await import('docx-preview') // lazy: only users who preview pay for it
          if (cancelled) return
          // renderAltChunks off: it would put the file's embedded HTML in a same-origin srcdoc iframe.
          await renderAsync(blob, docxRef.current, undefined, { renderAltChunks: false, ignoreLastRenderedPageBreak: true })
          neutralizeLinks(docxRef.current)
        }
      } catch (err) {
        if (!cancelled) setError(err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [attachment.storagePath, kind])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 backdrop-blur-sm sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-title"
        className="flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-xl"
      >
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <h2 id="preview-title" className="min-w-0 flex-1 truncate font-semibold text-fg" title={attachment.fileName}>
            {attachment.fileName}
          </h2>
          <a href={attachment.url} className={ui.link}>
            Download
          </a>
          <button type="button" onClick={onClose} className={ui.btnSecondary}>
            Close
          </button>
        </div>

        <div className="relative min-h-0 flex-1 overflow-auto bg-surface-2">
          {loading && <LoadingState label="Loading preview…" />}
          {error !== null && (
            <div className="p-4">
              <ErrorState error={error} />
            </div>
          )}
          {pdfUrl && <iframe src={pdfUrl} title={`Preview of ${attachment.fileName}`} className="h-full w-full" />}
          {kind === 'docx' && <div ref={docxRef} className={loading || error !== null ? 'hidden' : undefined} />}
        </div>
      </div>
    </div>
  )
}
