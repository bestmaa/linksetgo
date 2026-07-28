export type FallbackViewProps = {
  appName: string
  destination: string
  fallbackHref: string | null
  isLoading: boolean
  message: string
  openAppAction: { href: string; onClick: () => void } | null
  onCopy: () => void
  reportHref: string
  state: 'loading' | 'ready' | 'unavailable' | 'error'
  storeLinks: readonly { href: string; label: string; onClick: () => void }[]
  toast: string | null
}
