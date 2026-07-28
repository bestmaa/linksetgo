import type { ReactNode } from 'react'

export type BadgeTone = 'success' | 'warning' | 'neutral' | 'danger' | 'blue'

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: BadgeTone }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}
