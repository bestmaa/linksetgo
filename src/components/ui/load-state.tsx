import { Button } from './button'

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-label="Loading" aria-live="polite">
      {Array.from({ length: rows }, (_, index) => (
        <div className="skeleton skeleton-row" key={index} />
      ))}
    </div>
  )
}

export function ErrorState({
  message,
  onRetry,
  title = 'Something went wrong',
}: {
  message: string
  onRetry: () => void
  title?: string
}) {
  return (
    <div className="error-state" role="alert">
      <div>
        <span aria-hidden="true" className="empty-symbol">
          !
        </span>
        <h3>{title}</h3>
        <p>{message}</p>
        <Button onClick={onRetry} variant="secondary">
          Try again
        </Button>
      </div>
    </div>
  )
}
