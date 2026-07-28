type BrandMarkProps = {
  className?: string
}

export function BrandMark({ className = 'brand-mark' }: BrandMarkProps) {
  return (
    <span aria-hidden="true" className={className}>
      <svg fill="none" viewBox="0 0 36 36">
        <path d="M8.5 11.5h8.75c5.3 0 8.25 2.55 8.25 7.25" />
        <path d="m21 14.25 4.5 4.5-4.5 4.5" />
        <path d="M8.5 24.5h8" />
      </svg>
    </span>
  )
}
