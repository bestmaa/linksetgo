import type { FallbackURLThreat } from '@/lib/domain/fallback-url-safety'

export type URLSafetyProviderResult =
  | {
      kind: 'error'
      message: string
      retryable: boolean
    }
  | {
      expiresAt?: string
      kind: 'safe'
      observedAt: string
      redirectCount: number
    }
  | {
      expiresAt?: string
      kind: 'unsafe'
      observedAt: string
      redirectCount: number
      threats: readonly FallbackURLThreat[]
    }

export interface URLSafetyProvider {
  /**
   * Implementations must send the URL only to a fixed trusted reputation/scanning
   * service. The LinksetGo application process must never fetch the tenant URL.
   */
  assessURL(canonicalUrl: string): Promise<URLSafetyProviderResult>
}
