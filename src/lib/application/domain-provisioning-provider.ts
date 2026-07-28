import type { DomainDNSEvidence } from '@/lib/domain/domain-verification'

export type CertificateProvisioningStatus =
  | { kind: 'failed'; message: string }
  | { kind: 'pending' }
  | { certificateID: string; kind: 'ready'; renewsAt: string | null }

export type DomainProvisioningResult<T> =
  | { kind: 'disabled'; message: string }
  | { kind: 'error'; message: string; retryable: boolean }
  | { kind: 'success'; value: T }

export interface DomainProvisioningProvider {
  inspectDNS(hostname: string): Promise<DomainProvisioningResult<DomainDNSEvidence>>
  requestCertificate(
    hostname: string,
  ): Promise<DomainProvisioningResult<CertificateProvisioningStatus>>
}

export class DisabledDomainProvisioningProvider implements DomainProvisioningProvider {
  async inspectDNS(_hostname: string): Promise<DomainProvisioningResult<DomainDNSEvidence>> {
    return {
      kind: 'disabled',
      message: 'Automatic DNS inspection is disabled for this LinksetGo deployment.',
    }
  }

  async requestCertificate(
    _hostname: string,
  ): Promise<DomainProvisioningResult<CertificateProvisioningStatus>> {
    return {
      kind: 'disabled',
      message: 'Automatic certificate provisioning is disabled for this LinksetGo deployment.',
    }
  }
}
