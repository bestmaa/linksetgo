import { Button } from './button'

type EmptyStateProps = {
  actionLabel?: string
  description: string
  onAction?: () => void
  symbol?: string
  title: string
}

export function EmptyState({
  actionLabel,
  description,
  onAction,
  symbol = '↗',
  title,
}: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div>
        <span aria-hidden="true" className="empty-symbol">
          {symbol}
        </span>
        <h3>{title}</h3>
        <p>{description}</p>
        {actionLabel && onAction ? <Button onClick={onAction}>{actionLabel}</Button> : null}
      </div>
    </div>
  )
}
