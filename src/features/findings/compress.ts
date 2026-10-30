import imageCompression from 'browser-image-compression'

// Spec §8: keep screenshots well under 0.5 MB so the free 1 GB storage lasts.
const OPTIONS = {
  maxWidthOrHeight: 1920,
  fileType: 'image/webp',
  initialQuality: 0.8,
  maxSizeMB: 0.5,
  useWebWorker: true, // compress off the main thread so the page doesn't freeze
}

/** Shrinks a screenshot before upload. Falls back to JPEG on browsers that can't encode WebP. */
export async function compressScreenshot(file: File): Promise<Blob> {
  const result = await imageCompression(file, OPTIONS)
  if (result.type === 'image/webp') return result
  return imageCompression(file, { ...OPTIONS, fileType: 'image/jpeg' })
}
