/** Shows a failed load's message instead of an empty page. */
export function ErrorState({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : 'Something went wrong'
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-overdue-edge/40 bg-overdue-soft px-3 py-2.5 text-sm text-overdue"
    >
      <span aria-hidden="true">⚠</span>
      <span>{message}</span>
    </p>
  )
}
