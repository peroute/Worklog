export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <p role="status" className="p-6 text-sm text-gray-500">
      {label}
    </p>
  )
}
