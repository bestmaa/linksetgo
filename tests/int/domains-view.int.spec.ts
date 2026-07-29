import { createElement } from 'react'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { DomainsView } from '@/features/domains/domains.view'
import type { DomainsViewProps } from '@/features/domains/domains.types'

function viewProps(overrides: Partial<DomainsViewProps> = {}): DomainsViewProps {
  const onSelect = vi.fn()
  const baseDomain = {
    hostname: 'links.example.com',
    id: '41',
    isSelected: true,
    lastCheckedLabel: 'Not checked yet',
    onSelect,
    status: 'pending-dns' as const,
    statusDescription: 'Publish the exact DNS records.',
    statusLabel: 'Pending DNS',
    statusTone: 'neutral' as const,
    type: 'custom' as const,
    typeLabel: 'Custom domain',
  }
  return {
    domains: [baseDomain],
    error: null,
    hostname: '',
    hostnameError: null,
    isCreateOpen: false,
    isLoading: false,
    isSaving: false,
    onCloseCreate: vi.fn(),
    onCreate: vi.fn(),
    onHostnameBlur: vi.fn(),
    onHostnameChange: vi.fn(),
    onRefresh: vi.fn(),
    onSubmit: (event) => event.preventDefault(),
    releaseConfirmation: {
      error: null,
      hostname: '',
      isConfirmed: false,
      isOpen: false,
      isSaving: false,
      onClose: vi.fn(),
      onConfirmedChange: vi.fn(),
      onHostnameChange: vi.fn(),
      onSubmit: (event) => event.preventDefault(),
      targetHostname: null,
    },
    selectedDomain: {
      ...baseDomain,
      actionError: null,
      actionLabel: 'Check DNS & TLS',
      instructions: [
        {
          name: 'links.example.com',
          onCopyName: vi.fn(),
          onCopyValue: vi.fn(),
          type: 'CNAME',
          value: 'ingress.linksetgo.example',
        },
        {
          name: '_linksetgo-verification.links.example.com',
          onCopyName: vi.fn(),
          onCopyValue: vi.fn(),
          type: 'TXT',
          value: 'linksetgo-domain-verification=server-token',
        },
      ],
      instructionsError: null,
      isActionRunning: false,
      isLoadingInstructions: false,
      onPrimaryAction: vi.fn(),
      releaseGuidance: 'Do not ship this hostname yet.',
      verificationError: null,
    },
    submitError: null,
    toast: null,
    workspaceName: 'Company workspace',
    ...overrides,
  }
}

describe('domain console view', () => {
  it('exposes exact lifecycle and DNS setup with keyboard-operable copy actions', () => {
    render(createElement(DomainsView, viewProps()))

    expect(screen.getByRole('heading', { level: 1, name: 'Domains' })).toBeTruthy()
    expect(screen.getAllByText('pending-dns', { exact: true })).toHaveLength(2)
    expect(screen.getAllByText('Custom domain', { exact: true })).toHaveLength(2)
    expect(screen.getByText('ingress.linksetgo.example', { exact: true })).toBeTruthy()
    expect(
      screen.getByText('linksetgo-domain-verification=server-token', { exact: true }),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy CNAME name' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy CNAME value' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy TXT name' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy TXT value' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Check DNS & TLS' })).toBeTruthy()
    expect(screen.getByText(/Do not ship this hostname yet/)).toBeTruthy()

    const domainSelector = screen.getByRole('button', { pressed: true })
    expect(domainSelector.getAttribute('aria-pressed')).toBe('true')
  })

  it('labels registration as a server-authorized custom-domain request', () => {
    render(createElement(DomainsView, viewProps({ isCreateOpen: true })))

    const dialog = screen.getByRole('dialog', { name: 'Register custom domain' })
    expect(within(dialog).getByLabelText(/Public hostname/)).toBeTruthy()
    expect(within(dialog).getByText('Server policy is authoritative')).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Register domain' })).toBeTruthy()
  })

  it('requires hostname typing and an explicit released-build acknowledgement', () => {
    const props = viewProps()
    render(
      createElement(DomainsView, {
        ...props,
        releaseConfirmation: {
          ...props.releaseConfirmation,
          isOpen: true,
          targetHostname: 'links.example.com',
        },
      }),
    )

    const dialog = screen.getByRole('dialog', { name: 'Confirm mobile release support' })
    expect(within(dialog).getByLabelText(/Type/)).toBeTruthy()
    expect(within(dialog).getByRole('checkbox')).toBeTruthy()
    expect(
      within(dialog)
        .getByRole('button', { name: 'Activate custom domain' })
        .hasAttribute('disabled'),
    ).toBe(true)
  })
})
