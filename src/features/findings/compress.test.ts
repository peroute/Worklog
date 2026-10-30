import imageCompression from 'browser-image-compression'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { compressScreenshot } from './compress'

vi.mock('browser-image-compression', () => ({ default: vi.fn() }))
const compress = vi.mocked(imageCompression)

const screenshot = new File(['png-bytes'], 'screenshot.png', { type: 'image/png' })

describe('compressScreenshot', () => {
  beforeEach(() => compress.mockReset())

  it('shrinks to 1920px WebP at quality 0.8, max 0.5 MB', async () => {
    const webp = new File(['webp'], 'screenshot.webp', { type: 'image/webp' })
    compress.mockResolvedValueOnce(webp)

    await expect(compressScreenshot(screenshot)).resolves.toBe(webp)
    expect(compress).toHaveBeenCalledWith(screenshot, {
      maxWidthOrHeight: 1920,
      fileType: 'image/webp',
      initialQuality: 0.8,
      maxSizeMB: 0.5,
      useWebWorker: true,
    })
  })

  it('falls back to JPEG when the browser cannot encode WebP', async () => {
    const stillPng = new File(['png'], 'screenshot.png', { type: 'image/png' })
    const jpeg = new File(['jpg'], 'screenshot.jpg', { type: 'image/jpeg' })
    compress.mockResolvedValueOnce(stillPng).mockResolvedValueOnce(jpeg)

    await expect(compressScreenshot(screenshot)).resolves.toBe(jpeg)
    expect(compress).toHaveBeenCalledTimes(2)
    expect(compress.mock.calls[1][1]).toMatchObject({ fileType: 'image/jpeg' })
  })
})
