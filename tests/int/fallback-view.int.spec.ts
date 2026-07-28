import { createElement } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FallbackView } from '@/features/fallback/fallback.view'

afterEach(cleanup)

describe('public fallback branding and cross-host navigation', () => {
  it('uses the fixed marketing origin instead of the customer hostname', () => {
    render(
      createElement(FallbackView, {
        appName: 'Oberoi Mall',
        destination: '/offer',
        fallbackHref: null,
        isLoading: false,
        message: 'Choose another way to continue.',
        onCopy: vi.fn(),
        openAppAction: null,
        reportHref: '/report-abuse?target=offer',
        sourceHref: 'https://linksetgo.com/open-source',
        state: 'ready',
        storeLinks: [],
        toast: null,
      }),
    )

    expect(screen.getByRole('link', { name: 'Open source' }).getAttribute('href')).toBe(
      'https://linksetgo.com/open-source',
    )
    expect(screen.getByText(/Deep-link delivery by LinksetGo/)).toBeTruthy()
  })
})
