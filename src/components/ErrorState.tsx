/** Shows a failed load's message instead of an empty page. */
export function ErrorState({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : 'Something went wrong'
  return (
    <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      {message}
    </p>
  )
}
