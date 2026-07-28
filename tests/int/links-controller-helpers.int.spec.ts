import { describe, expect, it } from 'vitest'

import {
  approvedFallbackHosts,
  buildCreateLinkInput,
  fallbackURLForAppError,
  formForAvailableApps,
  linkStatusForApp,
  type FormDraft,
  parseRelationIdentifier,
} from '@/features/links/links-controller.helpers'

const form = (appId: string): FormDraft => ({
  appId,
  destinationPath: '/offers/welcome',
  expiresAt: '',
  fallbackUrl: '',
  name: 'Welcome offer',
  parameters: [],
  slug: 'welcome-offer',
  status: 'active',
})

describe('link controller helpers', () => {
  it('converts a PostgreSQL relation ID from the select control to a number', () => {
    expect(buildCreateLinkInput(form('42')).app).toBe(42)
  })

  it('preserves non-numeric relation IDs', () => {
    expect(parseRelationIdentifier('app_42')).toBe('app_42')
  })

  it('defaults a link to draft while its selected app is still draft', () => {
    expect(linkStatusForApp({ status: 'draft' }, 'active')).toBe('draft')
    expect(
      formForAvailableApps(form('9'), [
        { id: 9, name: 'Draft app', slug: 'draft-app', status: 'draft' },
      ]).status,
    ).toBe('draft')
  })

  it('accepts only the app default or explicitly approved fallback hosts', () => {
    const app = {
      allowedFallbackHosts: ['offers.example.com'],
      fallbackUrl: 'https://www.example.com/download',
      id: 9,
      name: 'Example',
      slug: 'example',
    }

    expect(approvedFallbackHosts(app)).toEqual(['www.example.com', 'offers.example.com'])
    expect(fallbackURLForAppError('https://offers.example.com/sale', app)).toBeNull()
    expect(fallbackURLForAppError('https://evil.example/phish', app)).toContain(
      'approved fallback host',
    )
    expect(fallbackURLForAppError('http://www.example.com', app)).toContain('HTTPS')
  })
})
