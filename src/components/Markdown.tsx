import ReactMarkdown, { type Components } from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'

interface MarkdownProps {
  children: string
  className?: string
}

/** Links leave the app in a new tab; noopener stops the new page from controlling this one. */
const components: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
}

/**
 * Renders user-written Markdown (tasks, findings).
 * Raw HTML is NOT enabled (no rehype-raw), so pasted markup is shown as text, never executed.
 * remark-breaks keeps single Enter presses as line breaks, matching how text looked before Markdown.
 */
export function Markdown({ children, className = '' }: MarkdownProps) {
  return (
    <div className={`markdown ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
