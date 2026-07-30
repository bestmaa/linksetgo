import { describe, expect, it } from 'vitest'

import { FallbackURLSafetyAssessments } from '@/collections/FallbackURLSafetyAssessments'
import { domainReadAccess, internalMutationAccess } from '@/lib/server/access'

describe('fallback URL safety assessment collection', () => {
  it('is private, workspace-readable, and internally mutable', () => {
    expect(FallbackURLSafetyAssessments.slug).toBe('fallback-url-safety-assessments')
    expect(FallbackURLSafetyAssessments.admin).toMatchObject({ hidden: true })
    expect(FallbackURLSafetyAssessments.access).toMatchObject({
      create: internalMutationAccess,
      delete: internalMutationAccess,
      read: domainReadAccess,
      update: internalMutationAccess,
    })
  })

  it('deduplicates exact URL assessments inside each workspace', () => {
    expect(FallbackURLSafetyAssessments.indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fields: ['workspace', 'urlHash'],
          unique: true,
        }),
      ]),
    )
    const fields = Array.isArray(FallbackURLSafetyAssessments.fields)
      ? FallbackURLSafetyAssessments.fields
      : []
    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'workspace', required: true }),
        expect.objectContaining({ name: 'origin', required: true }),
        expect.objectContaining({ name: 'canonicalUrl', required: true }),
        expect.objectContaining({ name: 'status', required: true }),
        expect.objectContaining({ name: 'checkedAt' }),
        expect.objectContaining({ name: 'claimExpiresAt', index: true }),
        expect.objectContaining({ name: 'claimToken' }),
        expect.objectContaining({ name: 'expiresAt' }),
        expect.objectContaining({ name: 'lastAttemptAt', index: true }),
        expect.objectContaining({ name: 'threats' }),
      ]),
    )
  })
})
