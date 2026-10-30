import { Link } from 'react-router-dom'
import type { FindingImage } from '../../data/types'

interface FindingDetailsProps {
  findingId: string
  title: string
  explanation: string
  images: FindingImage[]
  loadingImages: boolean
}

/** The expanded part of a finding row: full explanation + small screenshot thumbnails. */
export function FindingDetails({ findingId, title, explanation, images, loadingImages }: FindingDetailsProps) {
  return (
    <div className="space-y-3 px-4 pb-4 sm:pl-[8.75rem]">
      {/* Plain text: React escapes it, so pasted HTML shows as text, never as markup. */}
      <p className="text-sm leading-relaxed text-fg-muted whitespace-pre-wrap">{explanation}</p>

      {loadingImages && <p className="text-xs text-fg-subtle">Loading screenshots…</p>}
      {images.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {images.map((image, index) => (
            <li key={image.id}>
              <Link
                to={`/findings/${findingId}`}
                className="block overflow-hidden rounded-lg border border-line bg-surface-2 transition hover:border-accent"
              >
                <img
                  src={image.url}
                  alt={`${title} — screenshot ${index + 1}`}
                  loading="lazy"
                  className="h-20 w-28 object-cover"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
