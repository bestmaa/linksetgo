export type TXTEvidence = {
  observedAt: string
  values: readonly string[]
}

export interface DNSOwnershipEvidenceProvider {
  lookupTXT(recordName: string): Promise<TXTEvidence>
}
