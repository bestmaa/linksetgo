import { describe, expect, it } from 'vitest'

import { buildContentSecurityPolicy } from '@/lib/domain/security-headers'

describe('browser security policy', () => {
  it('blocks framing, objects, and foreign form targets in production', () => {
    const policy = buildContentSecurityPolicy(true)

    expect(policy).toContain("default-src 'self'")
    expect(policy).toContain("frame-ancestors 'none'")
    expect(policy).toContain("object-src 'none'")
    expect(policy).toContain("form-action 'self'")
    expect(policy).not.toContain("'unsafe-eval'")
    expect(policy).not.toContain('http://localhost')
  })

  it('allows local hot reload only outside production', () => {
    const policy = buildContentSecurityPolicy(false)

    expect(policy).toContain("'unsafe-eval'")
    expect(policy).toContain('http://localhost:*')
    expect(policy).toContain('ws:')
  })
})
