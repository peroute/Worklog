import { describe, expect, it } from 'vitest'
import { neutralizeLinks } from './DocumentPreview'

describe('neutralizeLinks', () => {
  it('strips script links and opens web links in a new tab', () => {
    // docx-preview copies these straight from the file's hyperlink targets.
    const el = document.createElement('div')
    el.innerHTML = `
      <a id="js" href="javascript:alert(1)">x</a>
      <a id="data" href="data:text/html,<script>1</script>">x</a>
      <a id="web" href="https://example.com">x</a>
      <a id="mail" href="mailto:a@b.c">x</a>
      <a id="anchor" href="#section">x</a>`
    neutralizeLinks(el)

    expect(el.querySelector('#js')).not.toHaveAttribute('href')
    expect(el.querySelector('#data')).not.toHaveAttribute('href')
    expect(el.querySelector('#web')).toHaveAttribute('target', '_blank')
    expect(el.querySelector('#web')).toHaveAttribute('rel', 'noopener noreferrer')
    expect(el.querySelector('#mail')).toHaveAttribute('href', 'mailto:a@b.c')
    expect(el.querySelector('#anchor')).not.toHaveAttribute('target') // stays in the document
  })
})
