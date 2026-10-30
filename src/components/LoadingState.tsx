export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <p role="status" className="flex items-center gap-2 p-6 text-sm text-fg-muted">
      <span
        aria-hidden="true"
        className="h-4 w-4 animate-spin rounded-full border-2 border-line-strong border-t-accent"
      />
      {label}
    </p>
  )
}
