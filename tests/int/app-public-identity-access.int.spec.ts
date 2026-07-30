import type { FieldAccess, PayloadRequest } from 'payload'
import { describe, expect, it } from 'vitest'

import { Apps } from '@/collections/Apps'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const mutationAccess = (fieldName: string, operation: 'create' | 'update'): FieldAccess => {
  const field = Apps.fields.find((candidate) => {
    const value: unknown = candidate
    return isRecord(value) && value.name === fieldName
  })
  const value: unknown = field
  if (!isRecord(value) || !isRecord(value.access)) {
    throw new Error(`Missing access policy for Apps.${fieldName}.`)
  }
  const access = value.access[operation]
  if (typeof access !== 'function') {
    throw new Error(`Missing ${operation} access policy for Apps.${fieldName}.`)
  }
  return access as FieldAccess
}

const request = (role: 'super-admin' | 'viewer'): PayloadRequest =>
  ({
    user: {
      id: role === 'super-admin' ? 1 : 2,
      role,
      status: 'active',
    },
  }) as PayloadRequest

describe('global app routing identity access', () => {
  for (const fieldName of ['publicKey', 'routingMode']) {
    it(`keeps tenant callers from assigning or changing Apps.${fieldName}`, async () => {
      for (const operation of ['create', 'update'] as const) {
        const access = mutationAccess(fieldName, operation)
        expect(await access({ req: request('viewer') } as Parameters<FieldAccess>[0])).toBe(false)
        expect(await access({ req: request('super-admin') } as Parameters<FieldAccess>[0])).toBe(
          true,
        )
      }
    })
  }
})
