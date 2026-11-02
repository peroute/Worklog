import { describe, expect, it } from 'vitest'
import { attachmentMimeType, extensionFor, formatBytes, isCompressibleImage } from './attachmentRules'

describe('attachmentMimeType', () => {
  it('decides by extension, ignoring what the browser claims', () => {
    // Windows reports .csv as Excel and .zip as x-zip-compressed; the bucket only knows the canonical types.
    expect(attachmentMimeType({ name: 'export.CSV', type: 'application/vnd.ms-excel' })).toBe('text/csv')
    expect(attachmentMimeType({ name: 'logs.zip', type: 'application/x-zip-compressed' })).toBe('application/zip')
    expect(attachmentMimeType({ name: 'brief.docx', type: '' })).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
  })

  it('rejects types outside the allowlist, even if they look harmless', () => {
    expect(attachmentMimeType({ name: 'setup.exe', type: 'application/x-msdownload' })).toBeNull()
    expect(attachmentMimeType({ name: 'page.html', type: 'text/html' })).toBeNull()
    expect(attachmentMimeType({ name: 'icon.svg', type: 'image/svg+xml' })).toBeNull() // SVG can carry scripts
    expect(attachmentMimeType({ name: 'README', type: 'text/plain' })).toBeNull()
  })

  it('accepts a pasted screenshot with no useful name by its image type', () => {
    expect(attachmentMimeType({ name: 'blob', type: 'image/png' })).toBe('image/png')
    expect(attachmentMimeType({ name: 'blob', type: 'image/svg+xml' })).toBeNull()
  })
})

describe('helpers', () => {
  it('only re-encodes still screenshots, not GIFs', () => {
    expect(isCompressibleImage('image/png')).toBe(true)
    expect(isCompressibleImage('image/gif')).toBe(false)
  })

  it('maps a type back to a storage extension', () => {
    expect(extensionFor('image/jpeg')).toBe('jpg')
    expect(extensionFor('application/pdf')).toBe('pdf')
    expect(extensionFor('application/x-unknown')).toBe('bin')
  })

  it('formats sizes for people', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(1_258_291)).toBe('1.2 MB')
  })
})
