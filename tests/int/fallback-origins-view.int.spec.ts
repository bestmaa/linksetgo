import { createElement } from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FallbackOriginsView } from '@/features/fallback-origins/fallback-origins.view'
import type { FallbackOriginsViewProps } from '@/features/fallback-origins/fallback-origins.types'

afterEach(cleanup)

function viewProps(overrides: Partial<FallbackOriginsViewProps> = {}): FallbackOriginsViewProps {
  const row = {
    hostname: 'fallback.company.com',
    id: '41',
    isSelected: true,
    lastCheckedLabel: 'Not checked yet',
    onSelect: vi.fn(),
    status: 'pending' as const,
    statusLabel: 'Pending',
    statusTone: 'neutral' as const,
  }
  return {
    error: null,
    isLoading: false,
    onCreate: vi.fn(),
    onRefresh: vi.fn(),
    origins: [row],
    registration: {
      error: null,
      hostname: '',
      hostnameError: null,
      isOpen: false,
      isSaving: false,
      onClose: vi.fn(),
      onHostnameBlur: vi.fn(),
      onHostnameChange: vi.fn(),
      onSubmit: (event) => event.preventDefault(),
    },
    required: true,
    revocation: {
      hostname: null,
      isOpen: false,
      isSaving: false,
      onCancel: vi.fn(),
      onConfirm: vi.fn(),
    },
    selectedOrigin: {
      ...row,
      actionError: null,
      isActionRunning: false,
      isLoadingInstructions: false,
      onRequestRevoke: vi.fn(),
      onVerify: vi.fn(),
      record: {
        name: '_linksetgo-fallback.fallback.company.com',
        onCopyName: vi.fn(),
        onCopyValue: vi.fn(),
        value: 'linksetgo-fallback-verification=server-generated-token',
      },
      verificationError: null,
    },
    toast: null,
    verificationAvailable: true,
    verificationMessage: null,
    workspaceName: 'Company workspace',
    ...overrides,
  }
}

describe('fallback-origin console view', () => {
  it('shows the exact TXT proof and explicit lifecycle actions in Cloud', () => {
    render(createElement(FallbackOriginsView, viewProps()))

    expect(screen.getByRole('heading', { level: 1, name: 'Fallback origins' })).toBeTruthy()
    expect(
      screen.getByText('_linksetgo-fallback.fallback.company.com', { exact: true }),
    ).toBeTruthy()
    expect(
      screen.getByText('linksetgo-fallback-verification=server-generated-token', { exact: true }),
    ).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Copy' })).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Verify TXT record' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Revoke origin' })).toBeTruthy()
    expect(screen.getByText(/never fetches a URL supplied by the tenant/i)).toBeTruthy()
  })

  it('makes Community behavior explicit without exposing Cloud controls', () => {
    render(
      createElement(
        FallbackOriginsView,
        viewProps({
          origins: [],
          required: false,
          selectedOrigin: null,
          verificationAvailable: false,
          workspaceName: null,
        }),
      ),
    )

    expect(screen.getByText('Not required in LinksetGo Community')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Register origin' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Verify TXT record' })).toBeNull()
  })

  it('states app-level allowlisting and permanent revocation consequences', () => {
    const props = viewProps()
    render(
      createElement(FallbackOriginsView, {
        ...props,
        registration: { ...props.registration, isOpen: true },
        revocation: {
          ...props.revocation,
          hostname: 'fallback.company.com',
          isOpen: true,
        },
      }),
    )

    const registration = screen.getByRole('dialog', { name: 'Register fallback origin' })
    expect(within(registration).getByLabelText(/HTTPS fallback hostname/)).toBeTruthy()
    expect(within(registration).getByText('Workspace proof, app-specific policy')).toBeTruthy()
    expect(within(registration).getByText(/Each app must still list the hostname/)).toBeTruthy()

    const revocation = screen.getByRole('dialog', { name: 'Revoke fallback origin?' })
    expect(within(revocation).getByText('Cloud routing will fail closed')).toBeTruthy()
    expect(within(revocation).getByRole('button', { name: 'Revoke permanently' })).toBeTruthy()
  })
})
